import { IceCubesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";

import { RegisterForm } from "@/features/user/components/register-form";

export default function RegisterPage() {
  return (
    <div className="grid min-h-svh lg:grid-cols-12">
      <div className="col-span-7 flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <div className="flex items-center gap-2 font-medium">
            <HugeiconsIcon icon={IceCubesIcon} className="size-4" />
            Knowledge Compiler
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <div className="mb-6 flex flex-col items-center gap-1 text-center">
              <h1 className="font-bold text-2xl">Create your account</h1>
              <p className="text-balance text-muted-foreground text-sm">
                Enter your email below to login to your account
              </p>
            </div>
            <RegisterForm />
          </div>
        </div>
      </div>
      <div className="relative col-span-5 m-4 hidden rounded-4xl bg-muted lg:block">
        <Image
          src="/magic.webp"
          alt="Register"
          fill
          preload
          sizes="42vw"
          className="absolute inset-0 h-full w-full rounded-4xl object-cover object-right dark:brightness-[0.6]"
        />
      </div>
    </div>
  );
}
