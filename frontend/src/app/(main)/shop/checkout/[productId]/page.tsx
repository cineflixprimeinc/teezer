import { ShopCheckoutPage } from "@/features/shop/shop-checkout-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("Checkout");

export default async function Page({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  return <ShopCheckoutPage productId={Number(productId)} />;
}
