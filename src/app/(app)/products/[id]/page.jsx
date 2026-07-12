import ProductForm from "@/components/ProductForm";

export default async function EditProductPage({ params }) {
  const { id } = await params;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Edit product</h1>
      <ProductForm productId={id} />
    </div>
  );
}
