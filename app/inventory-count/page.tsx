import { InventoryCountWorkspace } from "./workspace";
import { getInventoryCountActor, InventoryCountAccessError } from "@/lib/auth/inventory-count";

export const dynamic = "force-dynamic";

export default async function InventoryCountPage() {
  try {
    const actor = await getInventoryCountActor();
    if (actor.permissions.length === 0) {
      return (
        <section className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <h1 className="text-lg font-semibold">Chưa được cấp quyền Kiểm kho</h1>
          <p className="mt-2 text-sm">Liên hệ quản lý để được phân công sản phẩm hoặc cấp quyền thao tác kiểm kho.</p>
        </section>
      );
    }
    return <InventoryCountWorkspace permissions={actor.permissions} />;
  } catch (error) {
    if (error instanceof InventoryCountAccessError) {
      return <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error.message}</p>;
    }
    throw error;
  }
}
