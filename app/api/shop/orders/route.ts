// PATCH /api/shop/orders { shop_id, order_id } -> mark a paid order as handed over to the donor
import { fail, json, readBody, text } from "@/lib/api";
import { listShopOrders, updateOrder } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const b = await readBody(req);
  const shopId = text(b?.shop_id, 80);
  const orderId = text(b?.order_id, 80);
  if (!shopId || !orderId) return json({ message: "Missing order." }, 400);
  try {
    const order = (await listShopOrders(shopId)).find((o) => o.id === orderId);
    if (!order) return json({ message: "Order not found." }, 404);
    return json({ order: await updateOrder(orderId, { status: "handed_over" }) });
  } catch (err) {
    return fail(err);
  }
}
