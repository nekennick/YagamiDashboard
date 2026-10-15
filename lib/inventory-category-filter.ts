import type { Prisma } from "@prisma/client";

const nhiProductEntries = [
  "Súp Mì Lớn (52 lít) (Bịch)", "Súp Mì Nhỏ (26 lít) (Bịch)", "Súp Lẩu Thái Lớn (36 lít) (Bịch)", "Súp mì bò Đài Loan (Bịch)", "Súp miso (Bịch)", "Súp mì udon (Bịch)", "Sa Tế Tôm (Bịch)", "Súp Lẩu Tứ Xuyên (10 lít) (Bịch)", "Sốt Mì Ý (Bịch)", "Sốt Chấm Nướng (Bịch)", "Sốt Gà Cay (Bịch)", "Sốt Tiêu Đen (Bịch)", "Sốt Tương Đỏ (Bịch)", "Sốt Chấm Hoa Tiêu (Bịch)", "Sốt Ếch (Can)", "Sốt ướp bò (can)", "Sốt Tokboki (Can)", "Dầu điều (Can)", "Dầu ăn 30L (Can)", "Tương Ớt Mang Về (Thùng)", "Tương Cà Mang Về (Thùng)", "Tương cà (can)", "Tương Ớt Cholimex (Thùng)", "Hạt Nêm Knor (5kg) (Bịch)", "Tương ớt chinsu (Can)", "Sốt Hải Sản (Hủ)", "Bột Ngọt (Bịch)", "Bột chanh (Bịch)", "Bột Ớt (Kg)", "Ớt Khô (Kg)", "Đường cây (Cây)", "Nấm Đông Cô (Kg)", "Sốt xào bò (Bịch)", "Bọc Yagami 5kg (Kg)", "Bọc yagami 2kg (Kg)", "Lá Thơm (Kg)", "Mắm Tôm Lớn (Can)", "Mắm tôm nhỏ (Can)", "Bột Phomai (Bịch)", "Vị mì (Kg)", "Miến hàn quốc (Kg)", "Miến đậu xanh thái lan xanh lá 200g (Kg)", "Bột Bánh Bạch Tuột (Bịch)", "Rong Biển Kimpap (Bịch)", "Rong biển súp miso (Bịch)", "Mayone (3kg) (Hủ)", "Tomyum (Hủ)", "Giấy Cuộn (Bành)", "Khăn Giấy (Bịch)", "Giấy In Bill (thùng)", "Giấy thấm dầu trắng (Xấp)", "Giấy Thấm Dầu (Xấp)", "Mì ngũ sắc (thùng)", "MÌ GIẤY VỊ HƯƠNG (Thùng)", "Mì Ý (Bịch)", "Mì Đài Loan (Kg)", "Mì Yagami (thùng)", "Thố Mang Về (Cái)", "Nắp Ly Mang Về (Cái)", "Ly Mang Về (Cái)", "Thố giấy Yagami (Mẫu Mới) (Cái)", "Nắp thố giấy (Cái)", "Thố Giấy Yagami (Cái)", "Cá bào (500g) (Bịch)", "Tương Miso (Kg)", "Hộp pizza lớn (Cái)", "Hộp pizza nhỏ (Cái)", "Khăn Lạnh ChiBa (Cái)", "Lau Bếp (chai)", "SÂM LỤC VỊ (CHIBA) (GÓI)", "Đẳng Sâm (Kg)", "Súp lẩu thái (chiba) (Bịch)", "Súp lẩu nấm (Chiba) (Bịch)", "Súp lẩu cua đồng (Chiba) (Bịch)", "Sốt chấm hoa (Chiba) (Bịch)", "Sốt Chấm Lẩu (Bịch)", "Sa Tế Tôm ChiBa (Bịch)", "Sốt tương đen (Bịch)", "Gia Vị SaTe Bò (ChiBa) (Bịch)", "Rong biển thả lẩu 100g (Chiba) (Bịch)"
] as const;

const viProductEntries = [
  "Mứt xí muội (Bịch)", "Mứt mận (Hủ)", "Mứt me (Kg)", "Thốt Nốt Rim (Bịch)", "Nước Mơ (Kg)", "Nước Sấu (Kg)", "Nước sấu k trái (Lít)", "Dâu đài (Can)", "Xoài đài (Can)", "Vải Đài (Can)", "Đào Đài (Can)", "Sinh tố dâu tây (Chai)", "Sinh tố ổi hồng (Chai)", "Cốt Dâu Tằm (Chai)", "Cốt me (Chai)", "Sinh tố mận (Chai)", "Mứt dâu tây (Kg)", "Mứt Dâu Tằm (Kg)", "Mứt Nhãn Nhục (Hủ)", "Trà lài thái xanh (Bịch)", "Trà Đen (Kg)", "Hồng trà (Kg)", "Trà lài (Kg)", "Trân châu đài (Bịch)", "Gongcha Bịch (Bịch)", "Sữa rich (Hộp)", "Bột sữa V83 (Bịch)", "Nhãn lon (Lon)", "Đào lon (Lon)", "Vải Lon Việt Nam (Lon)", "Bạc hà torani (Chai)", "Dâu Torani (Chai)", "Cam Torani (Chai)", "Xoài torani (Chai)", "Caramel Torani (Chai)", "Vani Torani (Chai)", "Siro Blue Torani (Chai)", "Thơm Sun-up (Chai)", "Siro davinci dưa hấu (Chai)", "Xoài berino (Chai)", "Sinh tố thơm Berino (Chai)", "Vải Berino (Chai)", "Bột matcha (Bịch)", "Đường Đen (Kg)", "Hạt Socola (Hủ)", "Hạt Thủy Tinh (Hủ)", "Hạt Trái Cây (Hủ)", "Việt Quất GTP (Chai)", "Socola (Chai)", "Yến Mạch (Hủ)", "Mật Ong (Lít)", "Bột Khoai Môn (Bịch)", "Pudding Khoai Môn (Bịch)", "Pudding Trứng (Bịch)", "Labon xoài (Chai)", "Labon chanh dây (Chai)", "Siro mứt khế (Chai)", "Chuối Carame (Chai)", "Nước suối Vivant (Thùng)", "Trà Mật Ong (Thùng)", "Hồng Trà Đào (Thùng)", "Gelatine (Hộp)", "Sữa rich Versatie (Hộp)", "Whipping cream Anchor 1L (Hộp)"
] as const;

const vyProductEntries = [
  "Mì Udon (Gói)", "Thịt bò bằm (Kg)", "Bò Úc lát (Kg)", "Bò Mỹ lát (Kg)", "BA CHỈ BÒ MỸ CUỘN (Kg)", "Bò Việt Nam (Kg)", "Kim Chi (Kg)", "Cá Viên (Kg)", "Viên Thả Lẩu Cá Trích (Kg)", "Xúc xích YAGAMI (Kg)", "Thịt Đòn (Kg)", "Chả Cốm (Kg)", "Nem Rán (Kg)", "Dòi Tiết (Kg)", "Bún Lá (Kg)", "Tàu Hủ Hải Sản Surimi (Kg)", "Thịt heo bằm (Kg)", "Ba Chỉ Heo (Kg)", "Ốc Nhồi (Kg)", "Viên Thả Lẩu (Kg)", "Viên Thả Lẩu LC (kg)", "Vây Cá Hồi (Kg)", "Chân Gà (Net 1kg) (Bịch)", "Chả Cá Nha Trang (Kg)", "Bánh Bao Xá Xíu (Hộp)", "Bánh Bao Bí Đỏ (Hộp)", "Bánh Bao Than Tre (Hộp)", "Bánh Bao Kim Sa (Hộp)", "Cánh Gà Chiên 1.5KG (Bịch)", "Cánh gà 1,3kg (Bịch)", "Cánh gà (1kg) (Bịch)", "Gà cuộn (Kg)", "Đùi Gà Chiên (1.6 Kg) (Bịch)", "Đùi Gà Tỏi (Bịch)", "Gà Vòng Chiên (Bịch)", "Gà viên (Kg)", "Mực Vòng (Bịch)", "Bánh Gạo Hàn Quốc (Kg)", "Cải Muối (Hộp)", "Chả Bò (Kg)", "Thanh cua Việt Nam (Kg)", "Bánh Xếp Mandu (1.5kg) (Bịch)", "Há cảo Tôm (Bịch)", "Tôm xù rế (Hộp)", "Xíu Mại Tôm (Bịch)", "Bánh Mực (Bịch)", "Khoai tây (Kg)", "Hồ Lô (Kg)", "Bò viên (Kg)", "Bánh Hotteok Phô Mai HQ 600g (Bịch)", "Pizza phô mai lớn (Cái)", "Pizza phô mai nhỏ (Cái)", "Pizza hải sản lớn (Cái)", "Pizza hải sản nhỏ (Cái)", "Kimbap chiên (Hộp)", "Phô mai que LC (Hộp)", "Mì ramen (Bịch)", "Gà tatsu (Bịch)", "Phô Mai tảng (Tảng)", "Sò điệp (Kg)", "Chả Cá Nhật (Cây)", "Mực viên (Kg)", "Vó bò (Chiba) (Kg)", "Mực hoa xoắn (Chiba) (Kg)", "Râu bạch tuột hồng (Chiba) (Kg)", "Râu Bạch Tuột Đen (Kg)", "Ốc bươu nhồi thịt (Chiba) (Khay)", "Bao tử cá (Chiba) (Kg)", "Vẹm xanh (Chiba) (Kg)", "Thăn tuyết tảng (Chiba) (Kg)", "Thăn bò tảng (Chiba) (Kg)", "Nạc dăm heo tảng (Chiba) (Kg)", "Bắp bò hoa tảng (Chiba) (Kg)", "Ba chỉ heo tảng (Chiba) (Kg)", "Nạc vai heo tảng (Chiba) (Kg)", "Lá sách bò trắng (Chiba) (Kg)", "Lá sách bò đen (Chiba) (Kg)", "Bánh gạo cầu vồng (Chiba) (Gói)", "Mực vòng hải sản (Chiba) (Kg)", "Lòng bò (Kg)", "Đậu hủ cá Viên (Chiba) (Gói)", "Đậu Hủ Cá Miếng (Gói)", "Viên Thả Lẩu Hỗn Hợp (Kg)", "Ốc Nhồi Sò Điệp(ChiBa) (Hộp)", "Mề gà (Chiba) (Kg)", "Mai ghẹ Nhồi Farci (Chiba) (Gói)", "Mai ghẹ phô mai Farci (Chiba) (Gói)", "Bò Mỹ tảng (Chiba) (Kg)", "Gù hoa Kicol tảng (Chiba) (Kg)", "Lườn cá hồi (Chiba) (Kg)", "Cá thanh long (Chiba) (Gói)", "Sứa (Chiba) (Kg)", "Cá ba sa phi lê (Chiba) (Kg)", "Gừng Hồng (Gói)", "Tổ Ong Bò (Kg)", "Chả Cá Hàn Quốc (Kg)", "Cá Mô Phỏng Sò Điệp ( Chiba) (Gói)", "Mực xoắn Yosa (Chiba) (Gói)", "Cá cuộn Nhật (Gói)", "Cá cuộn trứng (Gói)", "Viên Cua Huỳnh Đế (ChiBa) (Gói)", "Viên Cá Thả Lẩu (ChiBa) (Gói)", "Mặt cười ĐP (Chiba) (Gói)", "Cá viên nhân thịt nấm (chiba) (Hộp)", "Cá viên nhân phô mai (chiba) (Hộp)", "Cá viên nhân trứng muối (chiba) (Hộp)", "Khăn Long (Kg)", "Đậu Hũ Cá Phô Mai LCFOOD (Gói)", "Tôm Hùm Viên (Kg)", "Viên túi tiền EB (Chiba) (Hộp)", "Lườn cá hồi (Chiba) LOẠI MỚI (Kg)", "Bào Ngư (Kg)", "Vẹm Nữa Mãnh Mới (ChiBa) (Bịch)", "Bánh mochi kem việt quất (15) (Hộp)", "Bánh mochi kem dâu (15) (Hộp)", "Bánh mochi kem xoài (15) (Hộp)", "Bánh mochi kem trà xanh (15) (Hộp)", "Bánh mochi kem socola (15) (Hộp)", "Bánh Tiramisu - mascarpone tiramitsu (15) (Hộp)", "Bánh socola nướng Gateau Au Chocolate (65) (Hộp)", "Bánh kem dâu tây Stawberry Mousse 65 (Hộp)", "Bánh opera 65 (Hộp)", "Bánh phô mai nướng -Newyork Cheese 65 (Hộp)", "Bánh Strawbery short cake cut 65 (Hộp)"
] as const;

const nhiProducts = nhiProductEntries.map((entry) => {
  const match = entry.match(/^(.*)\s+\(([^()]*)\)$/);
  return match ? { name: match[1], unit: match[2] } : { name: entry, unit: null };
});

const parseProductEntries = (entries: readonly string[]) => entries.map((entry) => {
  const match = entry.match(/^(.*)\s+\(([^()]*)\)$/);
  return match ? { name: match[1], unit: match[2] } : { name: entry, unit: null };
});

const viProducts = parseProductEntries(viProductEntries);
const vyProducts = parseProductEntries(vyProductEntries);

export const inventoryCategoryQuickFilters = [
  { value: "Vy", label: "Vy", description: `${vyProducts.length} mặt hàng được chỉ định`, products: vyProducts },
  { value: "Nhi", label: "Nhi", description: `${nhiProducts.length} mặt hàng được chỉ định`, products: nhiProducts },
  { value: "Vi", label: "Vi", description: `${viProducts.length} mặt hàng được chỉ định`, products: viProducts }
] as const;

export function inventoryCategoryFilter(category: string): Prisma.ProductWhereInput {
  const quickFilter = inventoryCategoryQuickFilters.find((filter) => filter.value === category);
  if (quickFilter) {
    return {
      OR: quickFilter.products.map((product) => ({
        name: { equals: product.name, mode: "insensitive" },
        ...(product.unit ? { unit: { equals: product.unit, mode: "insensitive" } } : {})
      }))
    };
  }
  return { categoryName: category };
}

export function quickFilterDescription(value: string) {
  return inventoryCategoryQuickFilters.find((filter) => filter.value === value)?.description ?? "";
}

export function quickFilterProductOrder(category: string) {
  const quickFilter = inventoryCategoryQuickFilters.find((filter) => filter.value === category);
  if (!quickFilter) return null;
  return new Map(quickFilter.products.map((product, index) => [
    `${product.name.toLocaleLowerCase()}\u0000${(product.unit ?? "").toLocaleLowerCase()}`,
    index
  ]));
}
