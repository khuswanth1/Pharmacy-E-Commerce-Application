import React, { useEffect, useState } from "react";
import { fetchCategoryList } from "../../api/partnerService";
import { Button, Field, inputClass, EmptyState } from "./PortalUI";
import { formatMoney } from "../../utils/roles";

const EMPTY = {
  name: "", brand: "", manufacturer: "", categorySlug: "", subType: "", packSize: "",
  mrp: "", sellingPrice: "", stock: "", composition: "", description: "", imageUrl: "",
  prescriptionRequired: false,
};

/** Add / edit form for a product. `onSave(form)` must return a promise. */
export const ProductFormModal = ({ product, onClose, onSave }) => {
  const [form, setForm] = useState(() =>
    product
      ? {
          ...EMPTY,
          ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, product[k] ?? EMPTY[k]])),
          categorySlug: product.categorySlug || product.trueCategorySlug || "",
        }
      : EMPTY
  );
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchCategoryList().then((c) => setCategories(c || [])).catch(() => setCategories([]));
  }, []);

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("Product name is required.");
    if (!(Number(form.sellingPrice) > 0)) return setError("Enter a selling price.");
    if (form.mrp && Number(form.sellingPrice) > Number(form.mrp)) return setError("Selling price cannot be more than MRP.");
    if (form.stock !== "" && !(Number(form.stock) >= 0)) return setError("Stock cannot be negative.");
    setBusy(true);
    try {
      await onSave({
        ...form,
        mrp: form.mrp === "" ? null : Number(form.mrp),
        sellingPrice: Number(form.sellingPrice),
        stock: form.stock === "" ? 0 : parseInt(form.stock, 10),
        categorySlug: form.categorySlug || null,
      });
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto space-y-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-slate-900">{product ? "Edit product" : "Add product"}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl px-2">×</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name *"><input className={inputClass} value={form.name} onChange={set("name")} /></Field>
          <Field label="Category">
            <select className={inputClass} value={form.categorySlug} onChange={set("categorySlug")}>
              <option value="">Choose a category</option>
              {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Brand"><input className={inputClass} value={form.brand} onChange={set("brand")} /></Field>
          <Field label="Manufacturer"><input className={inputClass} value={form.manufacturer} onChange={set("manufacturer")} /></Field>
          <Field label="Type (e.g. tablets, syrup)"><input className={inputClass} value={form.subType} onChange={set("subType")} /></Field>
          <Field label="Pack size"><input className={inputClass} value={form.packSize} onChange={set("packSize")} placeholder="10 tablets" /></Field>
          <Field label="MRP (₹)"><input className={inputClass} type="number" min="0" step="0.01" value={form.mrp} onChange={set("mrp")} /></Field>
          <Field label="Selling price (₹) *"><input className={inputClass} type="number" min="0" step="0.01" value={form.sellingPrice} onChange={set("sellingPrice")} /></Field>
          <Field label="Stock"><input className={inputClass} type="number" min="0" step="1" value={form.stock} onChange={set("stock")} /></Field>
          <Field label="Image URL"><input className={inputClass} value={form.imageUrl} onChange={set("imageUrl")} placeholder="https://…" /></Field>
        </div>
        <Field label="Composition"><input className={inputClass} value={form.composition} onChange={set("composition")} placeholder="Paracetamol 500mg" /></Field>
        <Field label="Description"><textarea className={inputClass} rows={3} value={form.description} onChange={set("description")} /></Field>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <input type="checkbox" checked={form.prescriptionRequired} onChange={set("prescriptionRequired")} />
          Needs a prescription
        </label>
        {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save product"}</Button>
        </div>
      </form>
    </div>
  );
};

/** Product table with quick stock edits. `onSaveStock(product, stock)` and `onEdit(product)` are callbacks. */
export const ProductTable = ({ products, onEdit, onDelete, onSaveStock, showVendor = false, lowStockAt = 10 }) => {
  const [stockDraft, setStockDraft] = useState({});
  if (!products?.length) return <EmptyState title="No products yet" body="Add your first product to start selling." />;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="text-left font-black px-3 py-2.5">Product</th>
            {showVendor && <th className="text-left font-black px-3 py-2.5">Listed by</th>}
            <th className="text-right font-black px-3 py-2.5">Price</th>
            <th className="text-right font-black px-3 py-2.5">Stock</th>
            <th className="px-3 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {products.map((p) => {
            const draft = stockDraft[p.id];
            const dirty = draft !== undefined && String(draft) !== String(p.stock);
            return (
              <tr key={p.id}>
                <td className="px-3 py-2.5 min-w-[180px]">
                  <p className="font-bold text-slate-800">{p.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {[p.brand, p.packSize, p.categorySlug].filter(Boolean).join(" · ")}
                    {p.prescriptionRequired && <span className="ml-1 text-rose-600 font-bold">Rx</span>}
                  </p>
                </td>
                {showVendor && <td className="px-3 py-2.5 text-slate-600">{p.vendorName || (p.vendorId ? "Vendor" : "Store")}</td>}
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <p className="font-bold text-slate-800">{formatMoney(p.sellingPrice)}</p>
                  {p.mrp && Number(p.mrp) !== Number(p.sellingPrice) && (
                    <p className="text-[11px] text-slate-400 line-through">{formatMoney(p.mrp)}</p>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="inline-flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      value={draft ?? p.stock}
                      onChange={(e) => setStockDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                      className={`w-16 text-right px-2 py-1 border rounded-lg tabular-nums ${p.stock <= lowStockAt ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}
                    />
                    {dirty && (
                      <Button
                        variant="dark"
                        className="px-2 py-1"
                        onClick={async () => {
                          await onSaveStock(p, parseInt(draft, 10));
                          setStockDraft((d) => { const n = { ...d }; delete n[p.id]; return n; });
                        }}
                      >
                        Save
                      </Button>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <Button variant="outline" className="px-2 py-1" onClick={() => onEdit(p)}>Edit</Button>
                  {onDelete && <Button variant="danger" className="px-2 py-1 ml-1" onClick={() => onDelete(p)}>Remove</Button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
