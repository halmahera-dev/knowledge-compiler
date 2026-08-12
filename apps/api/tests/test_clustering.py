"""Derived edges and community detection.

The graph could not cluster because it was barely a graph: edges are only ever
written between nodes one compile established, so nothing spanned two saves and a
real workspace came out as 28 disconnected components. These pin the rules that
reconnect it.

The two that matter most are negative. Co-occurrence within a single document is
not a signal — everything in a document co-occurs — and emitting it anyway turns
a twelve-concept save into a sixty-six-edge clique. And a derived edge must never
become a `GraphEdge`: a typed relation is a claim the agent made and can be
wrong; co-occurrence is a statistic that cannot be wrong, only uninteresting.
"""

from __future__ import annotations

import uuid

from app.services.clustering import (
    CO_OCCURRENCE_WEIGHT,
    MENTION_WEIGHT,
    assign_communities,
    build_graph,
    co_occurrence_edges,
    fingerprint,
    mention_edges,
)


def ids(n: int) -> list[uuid.UUID]:
    """Stable ids, so a failure names the same node every run."""
    return [uuid.UUID(int=i) for i in range(1, n + 1)]


class TestMentionEdges:
    def test_joins_a_concept_to_the_topic_it_was_found_in(self):
        topic, entity = ids(2)
        item = uuid.UUID(int=100)
        edges = mention_edges(
            {topic: {item}, entity: {item}}, {topic: "topic", entity: "entity"}
        )
        assert len(edges) == 1
        assert edges[0].source_id == entity
        assert edges[0].target_id == topic
        assert edges[0].kind == "mentions"

    def test_rescues_a_concept_that_nothing_links(self):
        # This is the whole point of the rule. An isolated entity has no edges by
        # definition, so provenance is the only thing that can reach it.
        topic, orphan = ids(2)
        item = uuid.UUID(int=100)
        edges = mention_edges(
            {topic: {item}, orphan: {item}}, {topic: "topic", orphan: "entity"}
        )
        assert [e.source_id for e in edges] == [orphan]

    def test_does_not_join_concepts_from_different_documents(self):
        topic, entity = ids(2)
        edges = mention_edges(
            {topic: {uuid.UUID(int=100)}, entity: {uuid.UUID(int=200)}},
            {topic: "topic", entity: "entity"},
        )
        assert edges == []

    def test_never_joins_two_topics(self):
        # Topic-to-topic is what the agent's typed edges are for. Inventing one
        # here would put a statistic where a judgement belongs.
        a, b = ids(2)
        item = uuid.UUID(int=100)
        edges = mention_edges({a: {item}, b: {item}}, {a: "topic", b: "topic"})
        assert edges == []

    def test_counts_how_many_documents_support_it(self):
        topic, entity = ids(2)
        shared = {uuid.UUID(int=100), uuid.UUID(int=200)}
        edges = mention_edges({topic: shared, entity: shared}, {topic: "topic", entity: "entity"})
        assert edges[0].shared_sources == 2


class TestCoOccurrenceEdges:
    def test_one_shared_document_is_not_a_signal(self):
        # Everything inside a document co-occurs. Emitting at one turns a
        # twelve-concept save into a sixty-six-edge clique — unreadable in a
        # different way than the dust it replaced.
        a, b = ids(2)
        item = uuid.UUID(int=100)
        assert co_occurrence_edges({a: {item}, b: {item}}, {a: "entity", b: "entity"}) == []

    def test_two_shared_documents_is(self):
        a, b = ids(2)
        shared = {uuid.UUID(int=100), uuid.UUID(int=200)}
        edges = co_occurrence_edges({a: shared, b: shared}, {a: "entity", b: "entity"})
        assert len(edges) == 1
        assert edges[0].kind == "co_occurs"
        assert edges[0].shared_sources == 2

    def test_emits_each_pair_once(self):
        # Ordered by id, so the caller never has to dedupe two directions of the
        # same fact.
        a, b = ids(2)
        shared = {uuid.UUID(int=100), uuid.UUID(int=200)}
        edges = co_occurrence_edges({a: shared, b: shared}, {a: "entity", b: "entity"})
        assert len(edges) == 1
        assert (edges[0].source_id, edges[0].target_id) == (a, b)

    def test_a_twelve_concept_document_produces_no_clique(self):
        # The regression this guards: 12 concepts sharing one document would be
        # 66 edges at a threshold of one.
        nodes = ids(12)
        item = uuid.UUID(int=100)
        edges = co_occurrence_edges(
            {n: {item} for n in nodes}, {n: "entity" for n in nodes}
        )
        assert edges == []


class TestBuildGraph:
    def test_keeps_nodes_nothing_touches(self):
        # A node absent from the graph is indistinguishable from one Louvain
        # declined to cluster, and 30% of this workspace was isolated.
        a, b, lonely = ids(3)
        graph = build_graph([a, b, lonely], [(a, b, 1.0)], [])
        assert graph.number_of_nodes() == 3
        assert lonely in graph

    def test_an_authored_edge_outweighs_a_derived_one(self):
        # The agent read both sides and asserted a relationship; co-occurrence
        # only observed proximity.
        assert MENTION_WEIGHT < 1.0
        assert CO_OCCURRENCE_WEIGHT < MENTION_WEIGHT

    def test_repeated_pairs_accumulate(self):
        a, b = ids(2)
        graph = build_graph([a, b], [(a, b, 1.0), (a, b, 1.0)], [])
        assert graph[a][b]["weight"] == 2.0

    def test_ignores_a_self_loop(self):
        (a,) = ids(1)
        graph = build_graph([a], [(a, a, 1.0)], [])
        assert graph.number_of_edges() == 0


class TestAssignCommunities:
    def test_separates_two_disconnected_clumps(self):
        a, b, c, d = ids(4)
        graph = build_graph([a, b, c, d], [(a, b, 1.0), (c, d, 1.0)], [])
        communities = assign_communities(graph)
        assert communities[a] == communities[b]
        assert communities[c] == communities[d]
        assert communities[a] != communities[c]

    def test_numbers_the_largest_community_zero(self):
        # The number is a colour index, and a stable ordering keeps the biggest
        # cluster from changing colour when an unrelated one grows.
        a, b, c, d = ids(4)
        graph = build_graph([a, b, c, d], [(a, b, 1.0), (b, c, 1.0), (a, c, 1.0)], [])
        communities = assign_communities(graph)
        assert communities[a] == 0
        assert communities[d] != 0

    def test_is_stable_across_runs(self):
        # Louvain is randomised. Without a fixed seed a colour would change
        # meaning on every save, which is worse than no colour.
        a, b, c, d = ids(4)
        graph = build_graph([a, b, c, d], [(a, b, 1.0), (c, d, 1.0)], [])
        assert assign_communities(graph) == assign_communities(graph)

    def test_an_empty_graph_yields_nothing_rather_than_failing(self):
        assert assign_communities(build_graph([], [], [])) == {}

    def test_derived_edges_can_join_what_authored_ones_cannot(self):
        # The reason any of this exists: two compiles can never share an authored
        # edge, so only a derived one can put their nodes in one community.
        topic_a, topic_b, shared = ids(3)
        items = {uuid.UUID(int=100), uuid.UUID(int=200)}
        derived = mention_edges(
            {topic_a: {uuid.UUID(int=100)}, topic_b: {uuid.UUID(int=200)}, shared: items},
            {topic_a: "topic", topic_b: "topic", shared: "entity"},
        )
        graph = build_graph([topic_a, topic_b, shared], [], derived)
        communities = assign_communities(graph)
        assert communities[topic_a] == communities[topic_b] == communities[shared]


class TestFingerprint:
    """The identity that makes a cached summary safe.

    Louvain renumbers on every run, so a summary stored against a cluster number
    describes a different set of nodes after the next save — silently, and in the
    one place a reader has no way to check it. The fingerprint is what stops that,
    so these pin exactly the property it is relied on for.
    """

    def test_same_members_in_any_order_give_the_same_mark(self):
        a, b, c = ids(3)
        assert fingerprint([a, b, c]) == fingerprint([c, a, b])

    def test_one_member_more_gives_a_different_mark(self):
        # The whole point: membership changing must invalidate the prose. If this
        # ever held equal, a summary would outlive the cluster it describes.
        a, b, c = ids(3)
        assert fingerprint([a, b]) != fingerprint([a, b, c])

    def test_one_member_swapped_gives_a_different_mark(self):
        a, b, c = ids(3)
        assert fingerprint([a, b]) != fingerprint([a, c])

    def test_renumbering_does_not_change_it(self):
        # A cluster that keeps its members but is handed a new number keeps its
        # mark — which is what lets the summary survive and the model call be
        # skipped. The number is not an input at all.
        a, b = ids(2)
        members = {0: [a, b]}
        renumbered = {3: [a, b]}
        assert fingerprint(members[0]) == fingerprint(renumbered[3])

    def test_an_empty_cluster_still_has_a_mark(self):
        assert isinstance(fingerprint([]), str)
        assert fingerprint([]) != fingerprint(ids(1))
