import { Card, CardContent } from "@/components/ui/card";
import type { DealWithContact } from "@/modules/crm/types";

export function DealCard({ deal }: { deal: DealWithContact }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="font-medium">{deal.contact.name}</p>
        <p className="text-sm text-muted-foreground">{deal.contact.phone}</p>
      </CardContent>
    </Card>
  );
}
