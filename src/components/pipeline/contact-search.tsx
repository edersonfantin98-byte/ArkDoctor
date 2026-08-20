"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { searchContactsAction } from "@/app/(app)/pipeline/actions";
import type { Contact } from "@/modules/crm/types";

export function ContactSearch({ onResults }: { onResults: (contacts: Contact[] | null) => void }) {
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string) {
    setQuery(value);
    if (!value.trim()) {
      onResults(null);
      return;
    }
    startTransition(async () => {
      const results = await searchContactsAction(value);
      onResults(results);
    });
  }

  return (
    <Input
      placeholder="Buscar por nome ou telefone"
      value={query}
      onChange={(e) => handleChange(e.target.value)}
      aria-busy={isPending}
      className="max-w-sm"
    />
  );
}
