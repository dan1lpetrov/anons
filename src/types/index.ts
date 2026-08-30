export type CategoryId = string;

export type SaleId = 'nike' | 'adidas' | 'puma';

export interface Category {
  id: CategoryId;
  name: string;
  emoji: string;
}

export interface Sale {
  id: SaleId;
  name: string;
  emoji: string;
  description: string;
  url: string;
}

export interface ProductColor {
  id: string;
  name: string;
  thumbnail: string;
  images: string[];
  sizes: string[];
  price?: number;
  originalPrice?: number;
  /** Raw scraped price before the sale campaign's reseller markup — see admin-upload.html. */
  basePrice?: number;
  baseOriginalPrice?: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  /** Raw scraped price before the sale campaign's reseller markup — see admin-upload.html. */
  basePrice?: number;
  baseOriginalPrice?: number;
  /** Site-wide display currency price/originalPrice are actually in — see api/_lib/pricing.ts. */
  currency?: 'USD' | 'UAH';
  categoryId: CategoryId;
  saleId: SaleId;
  sourceName: string;
  sourceUrl: string;
  productUrl: string;
  image: string;
  sizes: string[];
  colors: ProductColor[];
  featuredRank: number;
}

export interface CartItem {
  productId: string;
  size: string;
  colorId: string;
  quantity: number;
}

export interface OrderForm {
  comment: string;
}

export interface Order {
  id: string;
  createdAt: string;
  customer: OrderForm;
  items: Array<{
    product: Product;
    size: string;
    color: ProductColor;
    quantity: number;
    lineTotal: number;
  }>;
  total: number;
  telegramUser?: TelegramWebAppUser;
}

export type CatalogContext =
  | { mode: 'all' }
  | { mode: 'category'; categoryId: CategoryId }
  | { mode: 'sale'; saleId: SaleId };

export type SortOption = 'recommended' | 'price-desc' | 'price-asc';

export interface CatalogFilters {
  search: string;
  sizes: string[];
  brands: SaleId[];
}

export interface Banner {
  id: number;
  imageUrl: string;
  title: string;
  subtitle: string;
  linkCategoryId: string | null;
  linkSaleId: string | null;
  linkUrl: string | null;
  sortOrder: number;
  active: boolean;
}
