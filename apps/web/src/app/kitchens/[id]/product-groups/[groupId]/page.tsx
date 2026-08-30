"use client";

import type { components } from "@moja-kuchnia/api-client";
import { ArrowLeft, Package, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ImageLightbox } from "@/components/image-lightbox";
import { formatGroupStock } from "@/components/product-entry/product-catalog-panel";
import { ProductKindField, type ProductKindSelection } from "@/components/product-entry/product-kind-field";
import { Toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebApiClient } from "@/lib/api";
import { UNIT_LABELS, readApiError } from "@/lib/errors";
import { formatQuantityWithUnit } from "@/lib/format-quantity";
import { isDisplayableUrl, mediaDisplayUrl } from "@/lib/media-upload";
import type { BaseUnit } from "@/lib/quantity-input";

type Product = components["schemas"]["ProductDto"];
type ProductGroupDetail = components["schemas"]["ProductGroupDetailDto"];

export default function ProductGroupDetailPage() {
  const params = useParams<{ id: string; groupId: string }>();
  const kitchenId = params.id;
  const groupId = params.groupId;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [moveProduct, setMoveProduct] = useState<Product | null>(null);
  const [moveKind, setMoveKind] = useState<ProductKindSelection>({
    mode: "none",
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(
    null,
  );

  const groupQuery = useQuery({
    queryKey: ["product-groups", kitchenId, groupId],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error, response } = await client.GET(
        "/api/kitchens/{kitchenId}/product-groups/{groupId}",
        { params: { path: { kitchenId, groupId } } },
      );
      if (response.status === 404) {
        throw new Error("Nie znaleziono rodzaju produktu.");
      }
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się pobrać rodzaju produktu."),
        );
      }
      return data as ProductGroupDetail;
    },
  });

  const renameMutation = useMutation({
    mutationFn: async (name: string) => {
      const client = createWebApiClient();
      const { data, error } = await client.PATCH(
        "/api/kitchens/{kitchenId}/product-groups/{groupId}",
        {
          params: { path: { kitchenId, groupId } },
          body: { name },
        },
      );
      if (error || !data) {
        throw new Error(readApiError(error, "Nie udało się zmienić nazwy."));
      }
      return data;
    },
    onSuccess: async () => {
      await invalidateGroup();
      setRenaming(false);
      setToast("Zmieniono nazwę rodzaju.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      const { error } = await client.DELETE(
        "/api/kitchens/{kitchenId}/product-groups/{groupId}",
        { params: { path: { kitchenId, groupId } } },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się usunąć rodzaju."));
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["catalog", kitchenId] });
      await queryClient.invalidateQueries({
        queryKey: ["product-groups", kitchenId],
      });
      router.push(`/kitchens/${kitchenId}/stock`);
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (params: {
      productId: string;
      action: "detach" | "assign";
      kind: ProductKindSelection;
    }) => {
      const client = createWebApiClient();
      let resolvedGroupId: string | null = null;
      if (params.action === "assign") {
        if (params.kind.mode === "existing") {
          resolvedGroupId = params.kind.group.id;
        } else if (params.kind.mode === "create") {
          const { data: created, error: createError } = await client.POST(
            "/api/kitchens/{kitchenId}/product-groups",
            {
              params: { path: { kitchenId } },
              body: { name: params.kind.name },
            },
          );
          if (createError || !created) {
            throw new Error(
              readApiError(createError, "Nie udało się utworzyć rodzaju."),
            );
          }
          resolvedGroupId = created.id;
        } else {
          throw new Error("Wybierz rodzaj docelowy.");
        }
      }
      const { error } = await client.POST(
        "/api/kitchens/{kitchenId}/products/{productId}/assign-group",
        {
          params: { path: { kitchenId, productId: params.productId } },
          body: { groupId: resolvedGroupId },
        },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się przenieść produktu."),
        );
      }
    },
    onSuccess: async () => {
      setMoveProduct(null);
      setMoveKind({ mode: "none" });
      await invalidateGroup();
      setToast("Zaktualizowano przypisanie produktu.");
    },
  });

  async function invalidateGroup() {
    await queryClient.invalidateQueries({
      queryKey: ["product-groups", kitchenId, groupId],
    });
    await queryClient.invalidateQueries({ queryKey: ["catalog", kitchenId] });
    await queryClient.invalidateQueries({ queryKey: ["products", kitchenId] });
  }

  const group = groupQuery.data;
  const addProductHref = `/kitchens/${kitchenId}/products/new?groupId=${groupId}&from=group`;

  return (
    <AppShell kitchenId={kitchenId}>
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          href={`/kitchens/${kitchenId}/stock`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={16} />
          Wróć do zapasów
        </Link>

        {groupQuery.isPending ? (
          <p className="text-sm text-gray-500">Ładowanie…</p>
        ) : null}
        {groupQuery.isError ? (
          <p className="text-sm text-red-600" role="alert">
            {readApiError(groupQuery.error)}
          </p>
        ) : null}

        {group ? (
          <>
            <header className="space-y-3">
              {renaming ? (
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const next = nameDraft.trim();
                    if (!next) {
                      return;
                    }
                    renameMutation.mutate(next);
                  }}
                >
                  <div className="min-w-[12rem] flex-1">
                    <Label htmlFor="group-rename">Nazwa rodzaju</Label>
                    <Input
                      id="group-rename"
                      value={nameDraft}
                      onChange={(event) => setNameDraft(event.target.value)}
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={renameMutation.isPending}
                  >
                    Zapisz
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setRenaming(false)}
                  >
                    Anuluj
                  </Button>
                </form>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                      {group.name}
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                      {group.summary.activeProductCount} produktów ·{" "}
                      {group.summary.batchCount} partii ·{" "}
                      {formatGroupStock(group.summary)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setNameDraft(group.name);
                        setRenaming(true);
                      }}
                    >
                      <Pencil size={14} className="mr-1" />
                      Zmień nazwę
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setDeleteOpen(true)}
                    >
                      Usuń rodzaj
                    </Button>
                  </div>
                </div>
              )}
              {renameMutation.isError ? (
                <p className="text-sm text-red-600">
                  {readApiError(renameMutation.error)}
                </p>
              ) : null}
            </header>

            <div>
              <Link
                href={addProductHref}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-amber-500 px-5 text-sm font-semibold text-white hover:bg-amber-600"
              >
                <Plus size={16} />
                Dodaj produkt do tego rodzaju
              </Link>
            </div>

            <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-4">
                <h2 className="text-lg font-bold text-gray-900">Produkty</h2>
              </div>
              {group.products.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-gray-500">
                  Brak produktów w tym rodzaju.
                </p>
              ) : (
                <ul>
                  {group.products.map((product) => {
                    const thumb =
                      mediaDisplayUrl(product.image, "thumbnail") ??
                      (isDisplayableUrl(product.imageUrl)
                        ? product.imageUrl
                        : null);
                    const full =
                      mediaDisplayUrl(product.image) ??
                      (isDisplayableUrl(product.imageUrl)
                        ? product.imageUrl
                        : null);
                    const meta = [
                      product.brand,
                      product.variantLabel,
                      UNIT_LABELS[product.defaultUnit as BaseUnit],
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <li
                        key={product.id}
                        className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <button
                            type="button"
                            className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-emerald-50 bg-emerald-50/40"
                            disabled={!full || !thumb}
                            onClick={() => {
                              if (full) {
                                setPreview({ src: full, alt: product.name });
                              }
                            }}
                          >
                            {thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={thumb}
                                alt=""
                                className="h-full w-full object-contain"
                              />
                            ) : (
                              <Package
                                size={18}
                                className="text-emerald-300"
                              />
                            )}
                          </button>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-gray-900">
                              {product.name}
                            </p>
                            <p className="truncate text-xs text-gray-500">
                              {meta}
                              {product.packageQuantity && product.packageUnit
                                ? ` · opak. ${formatQuantityWithUnit(product.packageQuantity, product.packageUnit)}`
                                : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/kitchens/${kitchenId}/products/${product.id}/edit`}
                            className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-800 hover:bg-gray-50"
                          >
                            Edytuj
                          </Link>
                          <Link
                            href={`/kitchens/${kitchenId}/products/${product.id}/add-batch`}
                            className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-800 hover:bg-gray-50"
                          >
                            Dodaj partię
                          </Link>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setMoveProduct(product);
                              setMoveKind({ mode: "none" });
                            }}
                          >
                            Przenieś / odłącz
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </div>

      {preview ? (
        <ImageLightbox
          src={preview.src}
          alt={preview.alt}
          caption={preview.alt}
          onClose={() => setPreview(null)}
        />
      ) : null}

      {deleteOpen ? (
        <ConfirmDialog
          title={`Usunąć rodzaj „${group?.name ?? ""}”?`}
          description="Produkty pozostaną w katalogu, ale bez przypisanego rodzaju."
          confirmLabel="Usuń rodzaj"
          pending={deleteMutation.isPending}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={() => deleteMutation.mutate()}
        />
      ) : null}

      {moveProduct ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="move-product-title"
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
          >
            <h2
              id="move-product-title"
              className="text-lg font-semibold text-gray-900"
            >
              Przenieś „{moveProduct.name}”
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Wybierz inny rodzaj albo odłącz produkt.
            </p>
            <div className="mt-4">
              <ProductKindField
                kitchenId={kitchenId}
                value={moveKind}
                onChange={setMoveKind}
              />
            </div>
            {assignMutation.isError ? (
              <p className="mt-2 text-sm text-red-600">
                {readApiError(assignMutation.error)}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setMoveProduct(null);
                  setMoveKind({ mode: "none" });
                }}
              >
                Anuluj
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={assignMutation.isPending}
                onClick={() =>
                  assignMutation.mutate({
                    productId: moveProduct.id,
                    action: "detach",
                    kind: { mode: "none" },
                  })
                }
              >
                Odłącz od rodzaju
              </Button>
              <Button
                type="button"
                disabled={
                  assignMutation.isPending ||
                  (moveKind.mode !== "existing" && moveKind.mode !== "create")
                }
                onClick={() =>
                  assignMutation.mutate({
                    productId: moveProduct.id,
                    action: "assign",
                    kind: moveKind,
                  })
                }
              >
                Zapisz
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </AppShell>
  );
}
