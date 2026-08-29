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
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
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

export type Screen = 'home' | 'catalog' | 'product' | 'cart' | 'success';

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
  sortOrder: number;
  active: boolean;
}
