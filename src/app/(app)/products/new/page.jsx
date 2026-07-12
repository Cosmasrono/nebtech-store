import ProductForm from "@/components/ProductForm";

export default function NewProductPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Add product</h1>
      <ProductForm />
    </div>
  );
}
