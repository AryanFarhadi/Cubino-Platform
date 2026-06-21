"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Input } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import type { CategoryDTO } from "@cubino/shared";

export function CategoryManageModal({
  denId,
  category,
  onClose,
}: {
  denId: string;
  /** Omit to create a new category. */
  category?: CategoryDTO;
  onClose: () => void;
}) {
  const isEdit = !!category;
  const [name, setName] = useState(category?.name ?? "");
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Category name is required");
      if (isEdit) {
        return api(`/api/v1/categories/${category!.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: trimmed }),
        });
      }
      return api(`/api/v1/dens/${denId}/categories`, {
        method: "POST",
        body: JSON.stringify({ name: trimmed }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channels", denId] });
      onClose();
    },
  });

  return (
    <Modal onClose={onClose} className="max-w-sm" labelledById="category-manage-title">
      <div className="p-5">
        <h3 id="category-manage-title" className="font-bold text-den-cream">
          {isEdit ? "Rename category" : "Create category"}
        </h3>
        <p className="mt-1 text-sm text-den-muted">
          {isEdit
            ? "Update the category name shown in the channel list."
            : "Group channels under a labeled section."}
        </p>
        <label htmlFor="category-name" className="mt-4 block text-xs font-semibold uppercase text-den-muted">
          Name
        </label>
        <Input
          id="category-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Category name"
          className="mt-1"
          maxLength={100}
          autoFocus
        />
        {save.isError && (
          <p className="mt-2 text-sm text-den-berry">{(save.error as Error).message}</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-den px-4 py-2 text-sm text-den-muted">
            Cancel
          </button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}>
            {save.isPending ? "Saving..." : isEdit ? "Save" : "Create"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
