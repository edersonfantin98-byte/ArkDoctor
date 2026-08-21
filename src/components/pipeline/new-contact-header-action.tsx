"use client";

import { useRouter } from "next/navigation";
import { NewContactDialog } from "./new-contact-dialog";

export function NewContactHeaderAction() {
  const router = useRouter();
  return <NewContactDialog onCreated={() => router.refresh()} />;
}
