import type { Product, SaleId } from '../types';
import { sales } from './sales';

type ProductSeed = Omit<Product, 'sourceName' | 'sourceUrl'>;

const saleSources: Record<SaleId, Pick<Product, 'sourceName' | 'sourceUrl'>> = Object.fromEntries(
  sales.map(({ id, name, url }) => [id, { sourceName: name, sourceUrl: url }]),
) as Record<SaleId, Pick<Product, 'sourceName' | 'sourceUrl'>>;

const productSeeds: ProductSeed[] = [
  {
    id: 'tshirt-basic-white',
    name: 'Базова бавовняна футболка',
    description: 'Класична oversize футболка з м’якого бавовняного трикотажу. Ідеальна для повсякденного образу.',
    price: 399,
    originalPrice: 799,
    categoryId: 'tshirts',
    saleId: 'nike',
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&h=600&fit=crop',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    colors: [
      { id: 'white', name: 'Білий', hex: '#f5f5f5' },
      { id: 'black', name: 'Чорний', hex: '#1a1a1a' },
      { id: 'gray', name: 'Сірий', hex: '#9ca3af' },
    ],
    featuredRank: 3,
  },
  {
    id: 'tshirt-graphic',
    name: 'Футболка з принтом Vintage',
    description: 'Футболка з вінтажним принтом, relaxed fit. Розпродаж минулого сезону.',
    price: 549,
    originalPrice: 1099,
    categoryId: 'tshirts',
    saleId: 'puma',
    image: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=600&h=600&fit=crop',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: [
      { id: 'cream', name: 'Кремовий', hex: '#f5e6d3' },
      { id: 'olive', name: 'Оливковий', hex: '#6b705c' },
    ],
    featuredRank: 8,
  },
  {
    id: 'tshirt-adidas-essentials',
    name: 'Adidas Essentials футболка',
    description: 'М’яка футболка з логотипом trefoil. Розпродаж outlet-колекції.',
    price: 479,
    originalPrice: 899,
    categoryId: 'tshirts',
    saleId: 'adidas',
    image: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=600&h=600&fit=crop',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: [
      { id: 'black', name: 'Чорний', hex: '#1a1a1a' },
      { id: 'white', name: 'Білий', hex: '#f5f5f5' },
    ],
    featuredRank: 6,
  },
  {
    id: 'pants-denim',
    name: 'Джинси straight fit',
    description: 'Класичні джинси прямого крою, середня посадка. Знижка через розпродаж складу.',
    price: 899,
    originalPrice: 1899,
    categoryId: 'pants',
    saleId: 'adidas',
    image: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=600&h=600&fit=crop',
    sizes: ['28', '30', '32', '34', '36'],
    colors: [
      { id: 'blue', name: 'Синій', hex: '#3b5998' },
      { id: 'light-blue', name: 'Світло-синій', hex: '#93c5fd' },
    ],
    featuredRank: 10,
  },
  {
    id: 'pants-cargo',
    name: 'Карго штани utility',
    description: 'Функціональні карго з багатьма кишенями. Міцна тканина, зручний крій.',
    price: 749,
    originalPrice: 1499,
    categoryId: 'pants',
    saleId: 'puma',
    image: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=600&h=600&fit=crop',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: [
      { id: 'khaki', name: 'Хакі', hex: '#8b8c6e' },
      { id: 'black', name: 'Чорний', hex: '#1a1a1a' },
    ],
    featuredRank: 12,
  },
  {
    id: 'jacket-puffer',
    name: 'Nike пуховик легкий',
    description: 'Легкий утеплений пуховик, водовідштовхувальна тканина. Залишки колекції Nike.',
    price: 1899,
    originalPrice: 3999,
    categoryId: 'jackets',
    saleId: 'nike',
    image: 'https://images.unsplash.com/photo-1548126032-079a0fb0099d?w=600&h=600&fit=crop',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: [
      { id: 'black', name: 'Чорний', hex: '#1a1a1a' },
      { id: 'navy', name: 'Темно-синій', hex: '#1e3a5f' },
    ],
    featuredRank: 1,
  },
  {
    id: 'jacket-adidas-wind',
    name: 'Adidas вітровка',
    description: 'Легка вітровка для бігу та міста. Розпродаж сезонної колекції.',
    price: 1199,
    originalPrice: 2499,
    categoryId: 'jackets',
    saleId: 'adidas',
    image: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600&h=600&fit=crop',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: [
      { id: 'black', name: 'Чорний', hex: '#1a1a1a' },
      { id: 'green', name: 'Зелений', hex: '#4ade80' },
    ],
    featuredRank: 5,
  },
  {
    id: 'shoes-sneakers',
    name: 'Adidas Samba кросівки',
    description: 'Культові кросівки Samba. Універсальний дизайн, зручна підошва.',
    price: 1299,
    originalPrice: 2599,
    categoryId: 'shoes',
    saleId: 'adidas',
    image: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=600&h=600&fit=crop',
    sizes: ['39', '40', '41', '42', '43', '44'],
    colors: [
      { id: 'white', name: 'Білий', hex: '#f5f5f5' },
      { id: 'black', name: 'Чорний', hex: '#1a1a1a' },
    ],
    featuredRank: 2,
  },
  {
    id: 'shoes-nike-air',
    name: 'Nike Air Max кросівки',
    description: 'Легендарні Air Max з видимою амортизацією. Розпродаж Nike Sale.',
    price: 2199,
    originalPrice: 4499,
    categoryId: 'shoes',
    saleId: 'nike',
    image: 'https://images.unsplash.com/photo-1606107557195-0a29cbf1c12a?w=600&h=600&fit=crop',
    sizes: ['39', '40', '41', '42', '43', '44'],
    colors: [
      { id: 'white', name: 'Білий', hex: '#f5f5f5' },
      { id: 'red', name: 'Червоний', hex: '#ef4444' },
    ],
    featuredRank: 4,
  },
  {
    id: 'shoes-puma-rs',
    name: 'Puma RS-X кросівки',
    description: 'Chunky кросівки RS-X з ретро-дизайном. Акція Puma Sale.',
    price: 1499,
    originalPrice: 2999,
    categoryId: 'shoes',
    saleId: 'puma',
    image: 'https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=600&h=600&fit=crop',
    sizes: ['39', '40', '41', '42', '43'],
    colors: [
      { id: 'white', name: 'Білий', hex: '#f5f5f5' },
      { id: 'blue', name: 'Синій', hex: '#3b82f6' },
    ],
    featuredRank: 7,
  },
  {
    id: 'acc-cap',
    name: 'Puma кепка з логотипом',
    description: 'Бавовняна кепка з регульованим ременем. Аксесуар з розпродажу Puma.',
    price: 299,
    originalPrice: 599,
    categoryId: 'accessories',
    saleId: 'puma',
    image: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=600&h=600&fit=crop',
    sizes: ['One Size'],
    colors: [
      { id: 'black', name: 'Чорний', hex: '#1a1a1a' },
      { id: 'beige', name: 'Бежевий', hex: '#d4b896' },
    ],
    featuredRank: 11,
  },
  {
    id: 'acc-bag',
    name: 'Nike сумка crossbody',
    description: 'Компактна сумка через плече. Зручна для щоденного використання.',
    price: 649,
    originalPrice: 1299,
    categoryId: 'accessories',
    saleId: 'nike',
    image: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&h=600&fit=crop',
    sizes: ['One Size'],
    colors: [
      { id: 'black', name: 'Чорний', hex: '#1a1a1a' },
      { id: 'tan', name: 'Карамель', hex: '#c4956a' },
    ],
    featuredRank: 9,
  },
];

export const products: Product[] = productSeeds.map((product) => ({
  ...product,
  ...saleSources[product.saleId],
}));

export function getProductById(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

export function countProductsBySale(saleId: string): number {
  return products.filter((p) => p.saleId === saleId).length;
}

export function countProductsByCategory(categoryId: string): number {
  return products.filter((p) => p.categoryId === categoryId).length;
}
