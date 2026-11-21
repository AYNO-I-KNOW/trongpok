import type { Label, Product } from "@/lib/types";

export function findSourceReview(
  product: Pick<Product, "id" | "reviews"> | undefined,
  productId: string,
  label: Pick<Label, "reviewId" | "quote">,
) {
  if (!product || product.id !== productId || !label.quote.trim()) return;
  return product.reviews.find(
    (review) => review.id === label.reviewId && !review.isTemplate && review.text.includes(label.quote),
  );
}
