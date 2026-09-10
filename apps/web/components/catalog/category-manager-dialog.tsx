"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useCategories, useCreateCategory, useUpdateCategory } from "../../lib/catalog/queries";
import { categoryFormSchema, type CategoryFormValues } from "../../lib/catalog/schemas";
import { Dialog } from "../ui/dialog";

export interface CategoryManagerDialogProps {
  businessId: string;
  open: boolean;
  onClose: () => void;
  canManage: boolean;
}

export function CategoryManagerDialog({
  businessId,
  open,
  onClose,
  canManage,
}: CategoryManagerDialogProps) {
  const { data: categories } = useCategories(businessId);
  const createCategory = useCreateCategory(businessId);
  const updateCategory = useUpdateCategory(businessId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({ resolver: zodResolver(categoryFormSchema) });

  const onSubmit = handleSubmit(async (values) => {
    await createCategory.mutateAsync(values.name);
    reset();
  });

  return (
    <Dialog open={open} onClose={onClose} title="Categorías">
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {categories?.map((category) => (
          <li
            key={category.id}
            className="flex items-center justify-between rounded border border-gray-100 px-3 py-2 text-sm"
          >
            <span
              className={
                category.status === "inactive" ? "text-gray-400 line-through" : "text-gray-900"
              }
            >
              {category.name}
            </span>
            {canManage && (
              <button
                type="button"
                onClick={() =>
                  updateCategory.mutate({
                    categoryId: category.id,
                    status: category.status === "active" ? "inactive" : "active",
                  })
                }
                className="text-xs text-gray-500 underline"
              >
                {category.status === "active" ? "Desactivar" : "Activar"}
              </button>
            )}
          </li>
        ))}
        {categories?.length === 0 && (
          <li className="text-sm text-gray-500">Sin categorías todavía.</li>
        )}
      </ul>

      {canManage && (
        <form onSubmit={onSubmit} noValidate className="mt-4 flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="new-category-name" className="block text-sm font-medium text-gray-700">
              Nueva categoría
            </label>
            <input
              id="new-category-name"
              type="text"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              {...register("name")}
            />
            {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-accent text-accent-foreground rounded px-3 py-2 text-sm disabled:opacity-50"
          >
            Agregar
          </button>
        </form>
      )}
    </Dialog>
  );
}
