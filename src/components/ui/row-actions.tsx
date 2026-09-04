"use client";

import { useState, type ComponentType } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";

type IconType = ComponentType<{ className?: string }>;

export type RowAction =
  | { label: string; icon?: IconType; onSelect: () => void }
  | { separator: true };

export type DestructiveAction = {
  label: string;
  icon?: IconType;
  confirmText: string;
  confirmLabel: string;
  onConfirm: () => void;
};

export function RowActionsMenu({
  actions,
  destructive,
  triggerLabel = "Ações",
}: {
  actions: RowAction[];
  destructive?: DestructiveAction;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function close() {
    setOpen(false);
    setConfirming(false);
  }

  return (
    <Menu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirming(false);
      }}
    >
      <MenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={triggerLabel}>
            <MoreHorizontal />
          </Button>
        }
      />
      <MenuContent>
        {confirming && destructive ? (
          <div className="p-2">
            <p className="mb-2.5 text-xs text-muted-foreground">{destructive.confirmText}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  destructive.onConfirm();
                  close();
                }}
              >
                {destructive.confirmLabel}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {actions.map((action, i) =>
              "separator" in action ? (
                <MenuSeparator key={i} />
              ) : (
                <MenuItem
                  key={i}
                  onClick={() => {
                    action.onSelect();
                    close();
                  }}
                >
                  {action.icon ? <action.icon /> : null}
                  {action.label}
                </MenuItem>
              ),
            )}
            {destructive && (
              <>
                <MenuSeparator />
                <MenuItem
                  variant="danger"
                  closeOnClick={false}
                  onClick={() => setConfirming(true)}
                >
                  {destructive.icon ? <destructive.icon /> : null}
                  {destructive.label}
                </MenuItem>
              </>
            )}
          </>
        )}
      </MenuContent>
    </Menu>
  );
}
