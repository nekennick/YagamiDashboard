/**
 * Chuyển đổi số tiền thành chữ tiếng Việt chuẩn cho phiếu thu, phiếu chi, phiếu nhập hàng
 */
const defaultNumbers = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
const defaultUnits = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];

function readThreeDigits(threeDigits: number, showZeroHundred = false): string {
  let result = "";
  const hundred = Math.floor(threeDigits / 100);
  const remainder = threeDigits % 100;
  const ten = Math.floor(remainder / 10);
  const unit = remainder % 10;

  if (hundred > 0 || showZeroHundred) {
    result += `${defaultNumbers[hundred]} trăm `;
  }

  if (ten > 1) {
    result += `${defaultNumbers[ten]} mươi `;
    if (unit === 1) result += "mốt ";
    else if (unit === 5) result += "lăm ";
    else if (unit > 0) result += `${defaultNumbers[unit]} `;
  } else if (ten === 1) {
    result += "mười ";
    if (unit === 5) result += "lăm ";
    else if (unit > 0) result += `${defaultNumbers[unit]} `;
  } else if (ten === 0 && unit > 0) {
    if (hundred > 0 || showZeroHundred) result += "lẻ ";
    result += `${defaultNumbers[unit]} `;
  }

  return result.trim();
}

export function numberToVietnameseWords(amount: number | string | bigint): string {
  const num = typeof amount === "string" ? Math.round(parseFloat(amount) || 0) : Math.round(Number(amount));
  if (num === 0) return "Không đồng";
  if (num < 0) return `Âm ${numberToVietnameseWords(Math.abs(num)).toLowerCase()}`;

  let temp = num;
  const groups: number[] = [];

  while (temp > 0) {
    groups.push(temp % 1000);
    temp = Math.floor(temp / 1000);
  }

  let words = "";
  for (let i = groups.length - 1; i >= 0; i--) {
    const val = groups[i];
    if (val > 0) {
      const showZeroHundred = i < groups.length - 1;
      const groupText = readThreeDigits(val, showZeroHundred);
      words += `${groupText} ${defaultUnits[i]} `;
    }
  }

  words = words.trim();
  if (!words) return "Không đồng";

  // Viết hoa chữ cái đầu và thêm "đồng"
  words = words.charAt(0).toUpperCase() + words.slice(1) + " đồng chẵn.";
  return words.replace(/\s+/g, " ");
}
