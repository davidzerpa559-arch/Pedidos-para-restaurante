import { useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Route, Switch, useLocation, useParams, Router as WouterRouter, Link } from 'wouter';
import {
  ArrowLeft, ArrowUpRight, Check, Clock3, Heart, MapPin, MessageCircle, Minus, Plus, Search, Share2, ShoppingBag, Star, Trash2, X, Utensils, ClipboardList, Settings, LockKeyhole, LogOut, Pencil, PackageCheck, RefreshCw
} from 'lucide-react';
import {
  getGetAdminDashboardQueryKey, getGetAdminSessionQueryKey, getGetAdminStoreQueryKey, getGetStoreQueryKey, getHealthCheckQueryKey,
  getListAdminOrdersQueryKey, getListAdminProductsQueryKey, getListProductsQueryKey, getGetTrackedOrderStatusQueryKey,
  getListProductReviewsQueryKey, useCreateAdminSession, useCreateOrder, useCreateOrderReview, useCreateProduct,
  useDeleteProduct, useEndAdminSession, useGetAdminDashboard, useGetAdminSession, useGetAdminStore, useGetStore,
  useGetTrackedOrderStatus, useHealthCheck, useListAdminOrders, useListAdminProducts, useListProductReviews,
  useListProducts, useToggleProductLike, useUpdateAdminStore, useUpdateOrderStatus, useUpdateProduct
} from '@workspace/api-client-react';
import type { OrderInput, Product, ProductInput, ProductUpdate, ReviewInput, Store, StoreUpdate } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import type { ReactNode, FormEvent, ChangeEvent } from 'react';

const queryClient = new QueryClient();
const money = (value: number) => `$${Number(value || 0).toFixed(2)}`;
const moneyBs = (value: number) => `Bs. ${Number(value || 0).toLocaleString('es-VE', { maximumFractionDigits: 2 })}`;
const time = (value: string) => new Date(value).toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' });
const statusNames: Record<string, string> = {
  PENDIENTE: 'Pago por verificar', APROBADO: 'Pago aprobado', EN_PREPARACION: 'En preparación',
  DESPACHADO: 'En camino', ENTREGADO: 'Entregado', CANCELADO: 'Cancelado',
};
const statusSteps = ['PENDIENTE', 'APROBADO', 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO'];
const productPrice = (p: Product) => p.offerPrice ?? p.price;
const visitorKey = 'sazon-visitor-id';
function visitorId() {
  const found = localStorage.getItem(visitorKey);
  if (found) return found;
  const id = `${crypto.randomUUID()}-${Date.now().toString(36)}`;
  localStorage.setItem(visitorKey, id);
  return id;
}
function Header({ store, compact = false }: { store?: { name: string; logoUrl: string; isOpen: boolean; address: string }; compact?: boolean }) {
  return <header className="border-b border-border/70 bg-background/90">
    <div className="page-shell flex h-[72px] items-center justify-between gap-3">
      <Link href="/" className="flex items-center gap-3 text-inherit no-underline" data-testid="link-home">
        {store?.logoUrl ? <img src={store.logoUrl} className="h-10 w-10 rounded-full object-cover" alt="" /> :
          <span className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-secondary-foreground"><Utensils size={19} /></span>}
        <span><strong className="serif block text-[19px] leading-none">{store?.name || 'Sazón del Puerto'}</strong>
          {!compact && <small className="mt-1 block text-[10px] uppercase tracking-[.15em] text-muted-foreground">Puerto Cabello · cocina de aquí</small>}</span>
      </Link>
      <div className="flex items-center gap-3">
        {store && <span className={`hidden rounded-full px-3 py-1.5 text-xs font-bold sm:inline-flex ${store.isOpen ? 'bg-secondary/10 text-secondary' : 'bg-muted text-muted-foreground'}`} data-testid="status-store-open">
          <span className={`mr-2 mt-1 h-1.5 w-1.5 rounded-full ${store.isOpen ? 'bg-secondary' : 'bg-muted-foreground'}`} />{store.isOpen ? 'Abierto ahora' : 'Cerrado ahora'}
        </span>}
        <Link href="/admin" className="rounded-full border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground" data-testid="link-admin">Administración</Link>
      </div>
    </div>
  </header>;
}
function SkeletonFeed() {
  return <div className="space-y-5">{[1, 2, 3].map(i => <div className="product-card p-3" key={i}><div className="skeleton w-full" style={{ aspectRatio: '1.5' }} /><div className="skeleton mt-4 h-5 w-1/2" /><div className="skeleton mt-3 h-4 w-4/5" /></div>)}</div>;
}
function ReviewPanel({ product, close }: { product: Product; close: () => void }) {
  const reviews = useListProductReviews(product.id, { query: { queryKey: getListProductReviewsQueryKey(product.id) } });
  return <div className="overlay" onClick={close}><section className="dialog" onClick={e => e.stopPropagation()}>
    <div className="mb-4 flex items-center justify-between"><div><p className="eyebrow text-primary">Lo que cuenta la gente</p><h2 className="serif text-2xl">{product.name}</h2></div><button className="rounded-full p-2 hover:bg-muted" aria-label="Cerrar" onClick={close} data-testid="button-close-reviews"><X size={20}/></button></div>
    {reviews.isLoading ? <div className="space-y-3">{[1,2].map(x=><div className="skeleton h-20" key={x}/>)}</div>
      : reviews.isError ? <div className="rounded-xl bg-muted p-4 text-sm">No pudimos cargar las opiniones. <button onClick={() => reviews.refetch()} className="font-bold underline">Intentar de nuevo</button></div>
      : reviews.data?.length ? <div className="space-y-3">{reviews.data.map(r=><article className="rounded-xl border border-border p-4" key={r.id} data-testid={`review-${r.id}`}>
        <div className="flex justify-between"><strong>{r.customerName}</strong><span className="flex text-primary">{Array.from({length:r.rating},(_,i)=><Star key={i} size={13} fill="currentColor"/>)}</span></div><p className="mt-2 text-sm leading-relaxed">{r.comment}</p><small className="text-muted-foreground">{time(r.createdAt)}</small>
      </article>)}</div> : <div className="rounded-xl bg-muted/70 p-5 text-sm text-muted-foreground" data-testid="empty-product-reviews">Todavía no hay opiniones verificadas para este plato.</div>}
  </section></div>;
}
function ProductCard({ product, liked, onLike, onAdd, onReviews, onShare, disabled }: { product: Product; liked: boolean; onLike: (id:number)=>void; onAdd:(p:Product)=>void; onReviews:(p:Product)=>void; onShare:(p:Product)=>void; disabled:boolean }) {
  const reviews = useListProductReviews(product.id, { query: { queryKey: getListProductReviewsQueryKey(product.id) } });
  const latestReview = reviews.data?.[0];
  return <article id={`plato-${product.id}`} className="product-card reveal" data-testid={`card-product-${product.id}`}>
    <div className="relative">
      {product.photoUrl ? <img className="food-photo" src={product.photoUrl} alt={product.name} loading="lazy" data-testid={`img-product-${product.id}`} /> :
        <div className="food-photo grid place-items-center text-secondary" role="img" aria-label={product.name}><Utensils size={34}/></div>}
      {product.offerPrice !== null && <span className="absolute left-3 top-3 rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">Oferta</span>}
      {!product.available && <span className="absolute inset-x-3 bottom-3 rounded-lg bg-foreground/85 px-3 py-2 text-center text-xs font-bold text-background">No disponible hoy</span>}
    </div>
    <div className="p-4">
      <div className="flex items-start justify-between gap-3"><div><span className="eyebrow text-secondary">{product.category}</span><h2 className="serif mt-1 text-[23px] leading-tight">{product.name}</h2></div>
        <button onClick={() => onLike(product.id)} className={`flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1.5 text-xs ${liked ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`} aria-label={liked ? 'Quitar me gusta' : 'Me gusta'} data-testid={`button-like-${product.id}`}><Heart size={17} fill={liked ? 'currentColor' : 'none'}/><span>{product.likesCount}</span></button>
      </div>
      <p className="mt-2 min-h-[40px] text-sm leading-relaxed text-muted-foreground">{product.description}</p>
      <div className="mt-3 rounded-xl bg-muted/55 px-3 py-2.5" data-testid={`section-reviews-${product.id}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="eyebrow flex items-center gap-1.5 text-secondary"><MessageCircle size={13}/> Opiniones verificadas</span>
          <button onClick={()=>onReviews(product)} className="shrink-0 text-xs font-bold text-primary underline" data-testid={`button-reviews-${product.id}`}>Ver todas</button>
        </div>
        {reviews.isLoading ? <p className="mt-2 text-xs text-muted-foreground">Cargando opiniones…</p>
          : latestReview ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground">{latestReview.customerName}:</strong> {latestReview.comment}</p>
          : reviews.isError ? <p className="mt-2 text-xs text-muted-foreground">No se pudieron cargar las opiniones.</p>
          : <p className="mt-2 text-xs text-muted-foreground">Todavía no hay reseñas de pedidos confirmados.</p>}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div>{product.offerPrice !== null && <span className="mr-2 text-xs text-muted-foreground line-through">{money(product.price)}</span>}<strong className="text-lg">{money(productPrice(product))}</strong></div>
        <div className="flex gap-2">
          <button onClick={()=>onShare(product)} aria-label={`Compartir ${product.name}`} className="rounded-full border border-border p-2 hover:bg-muted" data-testid={`button-share-${product.id}`}><Share2 size={15}/></button>
          <button disabled={disabled || !product.available} onClick={() => onAdd(product)} className="btn-primary flex items-center gap-2 px-4 py-2 text-xs" data-testid={`button-add-${product.id}`}><Plus size={15}/><span>Sumar</span></button>
        </div>
      </div>
    </div>
  </article>;
}
type Cart = Record<number, { product: Product; quantity: number }>;
function Home() {
  const storeQ = useGetStore({ query: { queryKey: getGetStoreQueryKey() } });
  const productsQ = useListProducts(undefined, { query: { queryKey: getListProductsQueryKey(), refetchInterval: 10000 } });
  useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), retry: 1 } });
  const queryClient = useQueryClient();
  const likeMutation = useToggleProductLike({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }) } });
  const orderMutation = useCreateOrder();
  const [liked, setLiked] = useState<number[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(`${visitorKey}-likes`) ?? '[]');
      return Array.isArray(saved) ? saved.filter((id): id is number => Number.isInteger(id)) : [];
    } catch {
      return [];
    }
  });
  const [cart, setCart] = useState<Cart>({});
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todo');
  const [reviewProduct, setReviewProduct] = useState<Product | null>(null);
  const [checkout, setCheckout] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<{id:number;trackingToken:string;paymentReference:string}|null>(null);
  useEffect(() => {
    localStorage.setItem(`${visitorKey}-likes`, JSON.stringify(liked));
  }, [liked]);
  const allProducts = productsQ.data ?? [];
  const categories = useMemo(() => ['Todo', ...Array.from(new Set(allProducts.map(p => p.category)))], [allProducts]);
  const shown = useMemo(() => allProducts.filter(p => (category === 'Todo' || p.category === category) && `${p.name} ${p.description} ${p.category}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [allProducts, category, search]);
  const cartRows = Object.values(cart), itemCount = cartRows.reduce((sum, row) => sum + row.quantity, 0);
  const total = cartRows.reduce((sum, row) => sum + productPrice(row.product) * row.quantity, 0);
  const put = (product: Product, delta: number) => setCart(previous => {
    const old = previous[product.id]?.quantity ?? 0, quantity = old + delta;
    const next = { ...previous }; if (quantity <= 0) delete next[product.id]; else next[product.id] = { product, quantity }; return next;
  });
  const submitOrder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const input: OrderInput = {
      customerName: String(fd.get('name')), customerId: String(fd.get('customerId')), phone: String(fd.get('phone')),
      address: String(fd.get('address')), paymentReference: String(fd.get('reference')),
      items: cartRows.map(({product, quantity}) => ({ productId: product.id, quantity })),
    };
    orderMutation.mutate({ data: input }, { onSuccess: order => { setCreatedOrder({ id: order.id, trackingToken: order.trackingToken, paymentReference: input.paymentReference }); setCart({}); } });
  };
  const share = async (product: Product) => {
    const text = `${product.name} · ${money(productPrice(product))} — Sazón del Puerto`;
    const productUrl = new URL(location.href);
    productUrl.search = '';
    productUrl.hash = `plato-${product.id}`;
    try { if (navigator.share) await navigator.share({ title: product.name, text, url: productUrl.toString() }); else { await navigator.clipboard.writeText(`${text} ${productUrl.toString()}`); alert('Enlace del plato copiado para compartir.'); } } catch { /* share was dismissed */ }
  };
  const store = storeQ.data;
  return <div className="min-h-[100dvh] pb-28">
    <Header store={store} />
    <main className="page-shell">
      <section className="relative my-6 overflow-hidden rounded-[24px] bg-[#26493c] px-6 py-7 text-[#f9f1df] sm:my-8 sm:px-10 sm:py-9" data-testid="section-welcome">
        <div className="pointer-events-none absolute -right-10 -top-16 h-64 w-64 rounded-full border border-[#f9f1df]/15" />
        <div className="pointer-events-none absolute -right-1 top-0 h-44 w-44 rounded-full border border-[#f9f1df]/15" />
        <p className="eyebrow text-[#dfbd83]">Desde el malecón, con cariño</p>
        <h1 className="serif mt-3 max-w-[570px] text-[clamp(2.3rem,7vw,4.2rem)] leading-[.98]">El sabor de Puerto<br className="hidden sm:block"/> Cabello, en tu mesa.</h1>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#f9f1df]/80">
          {store?.address && <span className="flex items-center gap-1.5"><MapPin size={15}/>{store.address}</span>}
          {store?.hours && <span className="flex items-center gap-1.5"><Clock3 size={15}/>{store.hours}</span>}
        </div>
        {store && !store.isOpen && <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#f9f1df]/10 px-4 py-2 text-xs font-semibold text-[#f9f1df]" data-testid="notice-store-closed">Ahora estamos cerrados. Puedes mirar el menú y volver en horario de atención.</div>}
        {!storeQ.data && storeQ.isError && <div className="mt-4 text-sm">No se pudo consultar el horario. <button className="underline" onClick={()=>storeQ.refetch()}>Reintentar</button></div>}
      </section>
      <div className="feed-layout">
        <section>
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="eyebrow text-primary">La carta de hoy</p><h2 className="serif mt-1 text-3xl">Pide algo bueno.</h2></div>
            <label className="relative block w-full sm:max-w-[280px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={17}/><input className="field pl-10" type="search" placeholder="Buscar en el menú" value={search} onChange={e=>setSearch(e.target.value)} data-testid="input-menu-search"/></label>
          </div>
          <div className="mb-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Categorías del menú">
            {categories.map(c=><button key={c} onClick={()=>setCategory(c)} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-bold ${category===c?'border-secondary bg-secondary text-secondary-foreground':'border-border bg-card hover:bg-muted'}`} data-testid={`filter-category-${c}`}>{c}</button>)}
          </div>
          {productsQ.isLoading ? <SkeletonFeed/> : productsQ.isError ? <div className="soft-panel p-6 text-center" data-testid="error-products"><p className="serif text-xl">El menú no llegó a la mesa.</p><p className="mt-2 text-sm text-muted-foreground">Comprueba tu conexión e inténtalo otra vez.</p><button className="btn-primary mt-4 px-5 py-2.5 text-sm" onClick={()=>productsQ.refetch()} data-testid="button-retry-products">Volver a cargar</button></div>
            : shown.length ? <div className="space-y-5">{shown.map(p=><ProductCard key={p.id} product={p} liked={liked.includes(p.id)} disabled={!store?.isOpen} onLike={id=>likeMutation.mutate({id,data:{visitorId:visitorId()}},{onSuccess:res=>setLiked(prev=>res.liked?[...prev,id]:prev.filter(x=>x!==id))})} onAdd={p=>put(p,1)} onReviews={setReviewProduct} onShare={share}/>)}</div>
            : <div className="soft-panel p-8 text-center" data-testid="empty-menu"><Utensils className="mx-auto text-secondary" size={28}/><h3 className="serif mt-3 text-2xl">{allProducts.length ? 'No encontramos ese plato.' : 'La carta se está preparando.'}</h3><p className="mt-2 text-sm text-muted-foreground">{allProducts.length ? 'Prueba con otra búsqueda o categoría.' : 'Vuelve pronto para descubrir lo que cocina la casa.'}</p>{search && <button onClick={()=>{setSearch('');setCategory('Todo')}} className="mt-4 text-sm font-bold text-primary underline">Limpiar búsqueda</button>}</div>}
        </section>
        <aside className="desktop-only sticky top-5 space-y-4">
          <CartPanel cartRows={cartRows} total={total} exchangeRate={store?.exchangeRate ?? 0} itemCount={itemCount} change={put} open={()=>setCheckout(true)} disabled={!store?.isOpen}/>
          <div className="rounded-2xl bg-[#e9dfc9] p-5 text-[#3b3028]"><p className="eyebrow text-secondary">Hecho en el puerto</p><p className="serif mt-2 text-xl">Cocina cercana, ingredientes de nuestra costa.</p><p className="mt-2 text-xs leading-relaxed text-[#655a4e]">Cada pedido se prepara al momento. Gracias por apoyar a los negocios de barrio.</p></div>
        </aside>
      </div>
    </main>
    {itemCount > 0 && <button className="btn-primary fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 px-5 py-3.5 shadow-xl md:hidden" onClick={()=>setCheckout(true)} data-testid="button-open-cart">
       <ShoppingBag size={18}/><span>Ver pedido · {itemCount}</span><span className="border-l border-white/30 pl-3 text-right">{money(total)}<small className="block text-[10px] font-medium opacity-80">{store?.exchangeRate ? moneyBs(total * store.exchangeRate) : 'Bs. —'}</small></span>
    </button>}
    {reviewProduct && <ReviewPanel product={reviewProduct} close={()=>setReviewProduct(null)}/>}
    {checkout && !createdOrder && <div className="overlay" onClick={()=>setCheckout(false)}><section className="dialog" onClick={e=>e.stopPropagation()} data-testid="dialog-checkout">
      <div className="mb-5 flex items-start justify-between"><div><p className="eyebrow text-primary">Entrega a domicilio</p><h2 className="serif text-3xl">Tu pedido</h2></div><button className="rounded-full p-2 hover:bg-muted" onClick={()=>setCheckout(false)} aria-label="Cerrar" data-testid="button-close-checkout"><X size={20}/></button></div>
      {createdOrder ? null : <CheckoutContent store={store} cartRows={cartRows} total={total} change={put} submit={submitOrder} mutation={orderMutation}/>}
    </section></div>}
    {createdOrder && <div className="overlay"><section className="dialog text-center" data-testid="dialog-order-created"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-secondary/10 text-secondary"><Check size={26}/></div><p className="eyebrow mt-4 text-secondary">Pedido recibido</p><h2 className="serif mt-2 text-3xl">Ya estamos pendientes.</h2><p className="mt-2 text-sm text-muted-foreground">Tu pedido #{createdOrder.id} está esperando la verificación del pago.</p><Link href={`/pedido/${createdOrder.id}?token=${encodeURIComponent(createdOrder.trackingToken)}&ref=${encodeURIComponent(createdOrder.paymentReference)}`} className="btn-primary mt-6 inline-flex items-center gap-2 px-6 py-3 text-sm" onClick={()=>setCreatedOrder(null)} data-testid="link-track-order">Seguir mi pedido <ArrowUpRight size={17}/></Link></section></div>}
  </div>;
}
function CartPanel({cartRows,total,exchangeRate,itemCount,change,open,disabled}: {cartRows:{product:Product;quantity:number}[];total:number;exchangeRate:number;itemCount:number;change:(p:Product,d:number)=>void;open:()=>void;disabled:boolean}) {
  return <section className="soft-panel p-5" data-testid="panel-cart"><div className="flex items-center justify-between"><h3 className="serif text-2xl">Tu pedido</h3><ShoppingBag size={19} className="text-primary"/></div>
    {!cartRows.length ? <div className="py-7 text-center text-sm text-muted-foreground"><ShoppingBag className="mx-auto mb-2 opacity-50" size={24}/>Tu bolsa está esperando.</div>
      : <div className="mt-4 space-y-4">{cartRows.map(({product,quantity})=><div key={product.id} className="flex items-center justify-between gap-2" data-testid={`cart-line-${product.id}`}><div className="min-w-0"><p className="truncate text-sm font-semibold">{product.name}</p><small className="text-muted-foreground">{money(productPrice(product))}</small></div><div className="flex items-center gap-2"><button aria-label="Quitar uno" onClick={()=>change(product,-1)} className="rounded-full border border-border p-1" data-testid={`button-cart-minus-${product.id}`}><Minus size={13}/></button><span className="w-4 text-center text-sm">{quantity}</span><button aria-label="Agregar uno" onClick={()=>change(product,1)} className="rounded-full border border-border p-1" data-testid={`button-cart-plus-${product.id}`}><Plus size={13}/></button></div></div>)}</div>}
     <div className="mt-5 flex justify-between border-t border-border pt-4 text-sm"><span>Total estimado</span><span className="text-right"><strong className="block text-lg">{money(total)}</strong><small className="text-muted-foreground">{exchangeRate ? moneyBs(total * exchangeRate) : 'Bs. —'}</small></span></div>
    <button disabled={!itemCount || disabled} onClick={open} className="btn-primary mt-4 w-full py-3 text-sm" data-testid="button-checkout">{disabled?'Cerrado por ahora':'Continuar con el pedido'}</button>
    {disabled && <p className="mt-2 text-center text-xs text-muted-foreground">No tomamos pedidos fuera de horario.</p>}
  </section>;
}
function CheckoutContent({store,cartRows,total,change,submit,mutation}: {store?: Store;cartRows:{product:Product;quantity:number}[];total:number;change:(p:Product,d:number)=>void;submit:(e:FormEvent<HTMLFormElement>)=>void;mutation:ReturnType<typeof useCreateOrder>}) {
  const bs = total * (store?.exchangeRate ?? 0);
  return <form onSubmit={submit} className="space-y-4" data-testid="form-checkout">
     <div className="rounded-xl bg-muted/70 p-4"><div className="flex justify-between"><span className="text-sm">Total estimado</span><strong>{money(total)}</strong></div><p className="mt-1 text-right text-xs text-muted-foreground">{store?.exchangeRate ? `${moneyBs(bs)} al cambio publicado` : 'Tasa Bs./USD pendiente de configurar'}</p>
      <div className="mt-3 space-y-2 border-t border-border pt-3">{cartRows.map(({product,quantity})=><div key={product.id} className="flex justify-between text-sm"><span>{product.name} × {quantity}</span><div className="flex items-center gap-2"><strong>{money(productPrice(product)*quantity)}</strong><button type="button" onClick={()=>change(product,-quantity)} aria-label={`Quitar ${product.name}`} className="text-muted-foreground" data-testid={`button-remove-cart-${product.id}`}><Trash2 size={14}/></button></div></div>)}</div>
    </div>
    {store?.paymentConfigured ? <div className="rounded-xl border border-secondary/25 bg-secondary/5 p-4" data-testid="panel-payment-details"><p className="eyebrow text-secondary">Pago móvil</p><div className="mt-2 grid grid-cols-2 gap-y-2 text-sm"><span className="text-muted-foreground">Banco</span><strong>{store.bank}</strong><span className="text-muted-foreground">RIF</span><strong>{store.rif}</strong><span className="text-muted-foreground">Teléfono</span><strong>{store.paymentPhone}</strong><span className="text-muted-foreground">Cuenta / ID</span><strong>{store.paymentId}</strong><span className="text-muted-foreground">Monto</span><strong>{moneyBs(bs)}</strong></div><p className="mt-3 text-xs text-muted-foreground">Realiza el pago y escribe la referencia de 6 dígitos. Verificaremos antes de preparar.</p></div>
      : <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm" data-testid="notice-payment-unavailable"><strong>Pago móvil no configurado.</strong><p className="mt-1 text-muted-foreground">No se pueden recibir pedidos hasta que el restaurante active sus datos de pago.</p></div>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Nombre y apellido" name="name" required minLength={2} autoComplete="name"/>
      <Field label="Cédula (V- o E-)" name="customerId" required pattern="[VEve]-?[0-9]{5,10}" placeholder="V-12345678" title="Escribe V- o E- seguido de tu número de cédula" minLength={6} maxLength={12}/>
      <Field label="Teléfono" name="phone" required minLength={7} autoComplete="tel"/>
      <Field label="Referencia de pago (6 dígitos)" name="reference" required pattern="[0-9]{6}" inputMode="numeric" maxLength={6}/>
    </div>
    <label className="block text-sm font-semibold">Dirección de entrega<textarea className="field mt-1 min-h-[78px] resize-y" name="address" required minLength={8} maxLength={1000} placeholder="Calle, casa, sector y una referencia" data-testid="input-address"/></label>
    {mutation.isError && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" data-testid="error-create-order">No pudimos registrar el pedido. Revisa los datos e inténtalo de nuevo.</p>}
    <button type="submit" disabled={mutation.isPending || !store?.isOpen || !store.paymentConfigured || !cartRows.length} className="btn-primary w-full py-3.5 text-sm" data-testid="button-submit-order">{mutation.isPending?'Enviando pedido…':'Confirmar pedido'}</button>
    {(!store?.paymentConfigured || !store?.isOpen) && <p className="text-center text-xs text-muted-foreground">{!store?.isOpen?'El restaurante está cerrado.':'El pago móvil aún no está disponible.'}</p>}
  </form>;
}
function Field({label,name,required,type='text',...props}: {label:string;name:string;required?:boolean;type?:string;[key:string]:unknown}) {
  return <label className="block text-sm font-semibold">{label}<input className="field mt-1" name={name} type={type} required={required} data-testid={`input-${name}`} {...props}/></label>;
}
function Tracking() {
  const params = useParams<{id:string}>();
  const id = Number(params.id);
  const token = new URLSearchParams(location.search).get('token') || '';
  const storeQ = useGetStore({ query: { queryKey: getGetStoreQueryKey() } });
  const statusQ = useGetTrackedOrderStatus(id, { token }, { query: { queryKey: getGetTrackedOrderStatusQueryKey(id,{token}), enabled:Number.isFinite(id)&&id>0&&token.length>=16, refetchInterval:5000 } });
  const [reviewTarget, setReviewTarget] = useState<number | null>(null);
  const [reviewSent, setReviewSent] = useState<number[]>([]);
  const [reviewError, setReviewError] = useState('');
  const createReview = useCreateOrderReview();
  const [handoff, setHandoff] = useState(false);
  const status = statusQ.data;
  const approved = status?.status === 'APROBADO' || ['EN_PREPARACION','DESPACHADO','ENTREGADO'].includes(status?.status ?? '');
  const whatsapp = storeQ.data?.whatsapp?.replace(/\D/g,'');
  const orderSummary = status?.items.map(item=>`${item.quantity} × ${item.name}`).join(', ');
  const whatsappHref = whatsapp && status ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hola, soy cliente de ${storeQ.data?.name || 'Sazón del Puerto'}. Pedido #${status.id}: ${orderSummary}. Total ${money(status.totalUsd)} (${moneyBs(status.totalBs)}). Referencia ${new URLSearchParams(location.search).get('ref') || 'incluida en el pedido'}.`)}` : undefined;
  const sendReview = (event:FormEvent<HTMLFormElement>,productId:number) => {
    event.preventDefault(); const fd=new FormData(event.currentTarget); const input:ReviewInput={trackingToken:token,productId,comment:String(fd.get('comment')),rating:Number(fd.get('rating'))};
    setReviewError(''); createReview.mutate({id,data:input},{onSuccess:()=>{setReviewSent(prev=>[...prev,productId]);setReviewTarget(null)},onError:()=>setReviewError('No se pudo enviar la opinión. Comprueba el enlace del pedido e inténtalo de nuevo.')});
  };
  return <div className="min-h-[100dvh]"><Header store={storeQ.data} compact/><main className="page-shell max-w-[720px] py-7 sm:py-10">
    <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground" data-testid="link-back-menu"><ArrowLeft size={16}/> Volver al menú</Link>
    {statusQ.isLoading ? <div className="mt-6 space-y-4"><div className="skeleton h-36"/><div className="skeleton h-48"/></div>
    : statusQ.isError || !token ? <div className="soft-panel mt-6 p-7 text-center" data-testid="error-tracking"><LockKeyhole className="mx-auto text-primary" size={30}/><h1 className="serif mt-3 text-2xl">Este enlace no abrió.</h1><p className="mt-2 text-sm text-muted-foreground">Necesitas el enlace privado que recibiste al hacer tu pedido.</p><button className="mt-4 font-bold text-primary underline" onClick={()=>statusQ.refetch()}>Intentar de nuevo</button></div>
    : status && <div className="reveal">
      <section className="my-5 rounded-3xl bg-[#26493c] p-6 text-[#f9f1df] sm:p-8" data-testid="card-order-status">
        <p className="eyebrow text-[#dfbd83]">Seguimiento privado · Pedido #{status.id}</p><h1 className="serif mt-2 text-3xl sm:text-4xl">{statusNames[status.status] || status.status}</h1>
        <p className="mt-2 text-sm text-[#f9f1df]/75">Actualizado {time(status.updatedAt)}</p>
        <div className="mt-7 grid grid-cols-5 gap-1" aria-label="Progreso del pedido">
          {statusSteps.map((step,i)=>{const current=statusSteps.indexOf(status.status);const reached=current>=i;return <div key={step}><div className={`h-1.5 rounded-full ${reached?'bg-[#dfbd83]':'bg-[#f9f1df]/20'}`}/><small className={`mt-2 block text-[9px] leading-tight ${reached?'text-[#f9f1df]':'text-[#f9f1df]/45'}`}>{['Pago','Aprobado','Cocina','En camino','Entregado'][i]}</small></div>})}
        </div>
        {status.status==='PENDIENTE' && <p className="mt-6 rounded-xl bg-[#f9f1df]/10 p-3 text-sm" data-testid="status-payment-pending">Estamos comprobando tu pago móvil. Esta página se actualiza automáticamente cada pocos segundos.</p>}
        {status.status==='CANCELADO' && <p className="mt-5 rounded-xl bg-[#f9f1df]/10 p-3 text-sm" data-testid="status-order-cancelled">Este pedido fue cancelado. Si necesitas ayuda, escríbenos por WhatsApp.</p>}
      </section>
      <section className="soft-panel p-5 sm:p-6" data-testid="section-order-details"><div className="flex items-center justify-between"><h2 className="serif text-2xl">Detalle del pedido</h2><span className="eyebrow text-muted-foreground">{time(status.createdAt)}</span></div>
        <div className="mt-4 divide-y divide-border">{status.items.map((line,i)=><div className="flex justify-between gap-3 py-3 text-sm" key={`${line.productId}-${i}`}><span>{line.quantity} × {line.name}</span><strong>{money(line.lineTotal)}</strong></div>)}</div>
        <div className="mt-3 flex justify-between border-t border-border pt-4"><span>Total pagado</span><div className="text-right"><strong className="block text-lg">{money(status.totalUsd)}</strong><small className="text-muted-foreground">{moneyBs(status.totalBs)}</small></div></div>
      </section>
      {status.status==='PENDIENTE' && <section className="soft-panel mt-4 p-5" data-testid="section-payment-handoff"><p className="eyebrow text-primary">Pago móvil</p><h2 className="serif mt-1 text-xl">Datos para completar el pago</h2>
        {storeQ.data?.paymentConfigured?<div className="mt-3 grid grid-cols-2 gap-y-2 rounded-xl bg-muted/60 p-4 text-sm" data-testid="panel-tracking-payment-details"><span className="text-muted-foreground">Banco</span><strong>{storeQ.data.bank}</strong><span className="text-muted-foreground">RIF</span><strong>{storeQ.data.rif}</strong><span className="text-muted-foreground">Teléfono</span><strong>{storeQ.data.paymentPhone}</strong><span className="text-muted-foreground">Cuenta / ID</span><strong>{storeQ.data.paymentId}</strong><span className="text-muted-foreground">Monto</span><strong>{moneyBs(status.totalBs)}</strong></div>:<p className="mt-2 text-sm text-muted-foreground" data-testid="notice-tracking-payment-unavailable">Los datos de pago todavía no están configurados. Contacta al restaurante.</p>}
        <p className="mt-4 text-sm text-muted-foreground">Referencia registrada: <strong className="font-mono text-foreground">{new URLSearchParams(location.search).get('ref') || 'No disponible'}</strong></p><h3 className="serif mt-4 text-lg">¿Ya pagaste? Pásanos la referencia.</h3>
        {whatsappHref ? <a href={whatsappHref} target="_blank" rel="noreferrer" onClick={()=>setHandoff(true)} className="btn-primary mt-4 inline-flex items-center gap-2 px-5 py-3 text-sm" data-testid="link-whatsapp-handoff">Abrir WhatsApp <ArrowUpRight size={16}/></a> : <p className="mt-3 text-sm text-muted-foreground">El restaurante todavía no configuró WhatsApp de contacto.</p>}
        {handoff && <p className="mt-3 text-xs text-secondary" data-testid="text-whatsapp-handoff">WhatsApp abierto. Tu pedido sigue pendiente hasta que confirmemos el pago.</p>}
      </section>}
      {approved && <section className="soft-panel mt-4 p-5 sm:p-6" data-testid="section-verified-review"><p className="eyebrow text-secondary">Compra verificada</p><h2 className="serif mt-1 text-2xl">¿Qué te pareció?</h2><p className="mt-1 text-sm text-muted-foreground">Tu opinión ayuda a tus vecinos a elegir.</p>
        <div className="mt-4 space-y-3">{status.items.map((line,i)=><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/60 p-3" key={`${line.productId}-${i}`}><strong className="text-sm">{line.name}</strong>{reviewSent.includes(line.productId)?<span className="flex items-center gap-1 text-xs font-bold text-secondary"><Check size={15}/> Opinión enviada</span>:reviewTarget===line.productId?<form onSubmit={e=>sendReview(e,line.productId)} className="w-full space-y-2" data-testid={`form-review-${line.productId}`}><select name="rating" className="field" defaultValue="5" aria-label="Calificación" data-testid={`input-rating-${line.productId}`}>{[5,4,3,2,1].map(n=><option value={n} key={n}>{n} de 5 estrellas</option>)}</select><textarea className="field" name="comment" required minLength={1} maxLength={1000} placeholder="Cuéntanos cómo estuvo" data-testid={`input-review-comment-${line.productId}`}/>{reviewError&&<p className="text-xs text-destructive">{reviewError}</p>}<div className="flex gap-2"><button disabled={createReview.isPending} className="btn-primary px-4 py-2 text-xs" data-testid={`button-send-review-${line.productId}`}>{createReview.isPending?'Enviando…':'Publicar opinión'}</button><button type="button" onClick={()=>setReviewTarget(null)} className="px-3 text-xs">Cancelar</button></div></form>:<button onClick={()=>setReviewTarget(line.productId)} className="rounded-full border border-border px-4 py-2 text-xs font-bold" data-testid={`button-review-order-${line.productId}`}>Escribir opinión</button>}</div>)}</div>
      </section>}
    </div>}
  </main></div>;
}
function Admin() {
  const queryClient = useQueryClient();
  const session = useGetAdminSession({query:{queryKey:getGetAdminSessionQueryKey(),retry:false}});
  const authenticated = Boolean(session.data?.authenticated);
  const login = useCreateAdminSession({mutation:{onSuccess:()=>queryClient.invalidateQueries({queryKey:getGetAdminSessionQueryKey()})}});
  const logout = useEndAdminSession({mutation:{onSuccess:()=>{queryClient.invalidateQueries({queryKey:getGetAdminSessionQueryKey()});queryClient.removeQueries({queryKey:getGetAdminDashboardQueryKey()});}}});
  const [pin,setPin]=useState('');
  const [tab,setTab]=useState<'orders'|'menu'|'store'>('orders');
  const [orderFilter,setOrderFilter]=useState('');
  const dashboard=useGetAdminDashboard({query:{queryKey:getGetAdminDashboardQueryKey(),enabled:authenticated}});
  const orders=useListAdminOrders(orderFilter?{status:orderFilter}:undefined,{query:{queryKey:getListAdminOrdersQueryKey(orderFilter?{status:orderFilter}:undefined),enabled:authenticated,refetchInterval:8000}});
  const products=useListAdminProducts({query:{queryKey:getListAdminProductsQueryKey(),enabled:authenticated}});
  const store=useGetAdminStore({query:{queryKey:getGetAdminStoreQueryKey(),enabled:authenticated}});
  const statusMutation=useUpdateOrderStatus({mutation:{onSuccess:()=>{queryClient.invalidateQueries({queryKey:getListAdminOrdersQueryKey()});queryClient.invalidateQueries({queryKey:getGetAdminDashboardQueryKey()});}}});
  const createProduct=useCreateProduct({mutation:{onSuccess:()=>{queryClient.invalidateQueries({queryKey:getListAdminProductsQueryKey()});queryClient.invalidateQueries({queryKey:getListProductsQueryKey()});}}});
  const updateProduct=useUpdateProduct({mutation:{onSuccess:()=>{queryClient.invalidateQueries({queryKey:getListAdminProductsQueryKey()});queryClient.invalidateQueries({queryKey:getListProductsQueryKey()});}}});
  const deleteProduct=useDeleteProduct({mutation:{onSuccess:()=>{queryClient.invalidateQueries({queryKey:getListAdminProductsQueryKey()});queryClient.invalidateQueries({queryKey:getListProductsQueryKey()});}}});
  const updateStore=useUpdateAdminStore({mutation:{onSuccess:()=>{queryClient.invalidateQueries({queryKey:getGetAdminStoreQueryKey()});queryClient.invalidateQueries({queryKey:getGetStoreQueryKey()});}}});
  const [editing,setEditing]=useState<Product|null|false>(false);
  const [config,setConfig]=useState<StoreUpdate|null>(null);
  const metrics = [
    { label: 'Hoy', metric: dashboard.data?.today },
    { label: 'Esta semana', metric: dashboard.data?.week },
    { label: 'Este mes', metric: dashboard.data?.month },
  ];
  useEffect(()=>{if(store.data&&!config)setConfig({name:store.data.name,logoUrl:store.data.logoUrl,rif:store.data.rif,address:store.data.address,whatsapp:store.data.whatsapp,bank:store.data.bank,paymentId:store.data.paymentId,paymentPhone:store.data.paymentPhone,exchangeRate:store.data.exchangeRate,manualOpen:store.data.manualOpen,schedule:store.data.schedule})},[store.data,config]);
  const loginSubmit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();login.mutate({data:{pin}},{onSuccess:res=>{if(!res.authenticated)login.reset()}})};
  const productSubmit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);const input:ProductInput={name:String(f.get('name')),description:String(f.get('description')),category:String(f.get('category')),price:Number(f.get('price')),offerPrice:String(f.get('offerPrice'))?Number(f.get('offerPrice')):null,photoUrl:String(f.get('photoUrl')),available:f.get('available')==='on'};
    if(editing)updateProduct.mutate({id:editing.id,data:input as ProductUpdate},{onSuccess:()=>setEditing(false)});else createProduct.mutate({data:input},{onSuccess:()=>setEditing(false)});
  };
  const storeSubmit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();if(config)updateStore.mutate({data:config});};
  return <div className="min-h-[100dvh]"><Header compact/><main className="page-shell max-w-[1050px] py-7 sm:py-10">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow text-primary">Sazón del Puerto</p><h1 className="serif mt-1 text-4xl">Mesa de control</h1><p className="mt-1 text-sm text-muted-foreground">Pedidos, carta y casa en un solo lugar.</p></div><Link href="/" className="rounded-full border border-border px-4 py-2 text-sm font-semibold" data-testid="link-view-menu">Ver menú público <ArrowUpRight className="ml-1 inline" size={15}/></Link></div>
    {session.isLoading ? <div className="soft-panel p-8"><div className="skeleton mx-auto h-10 max-w-xs"/><div className="skeleton mx-auto mt-4 h-4 max-w-sm"/></div>
    : !authenticated ? <section className="soft-panel mx-auto max-w-md p-6 sm:p-8" data-testid="panel-admin-login"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-secondary/10 text-secondary"><LockKeyhole size={22}/></div><h2 className="serif mt-4 text-center text-2xl">Acceso del equipo</h2><p className="mt-1 text-center text-sm text-muted-foreground">Ingresa el PIN de administración para continuar.</p>
      <form onSubmit={loginSubmit} className="mt-5 space-y-3"><label className="block text-sm font-semibold">PIN<input className="field mt-1 text-center text-lg tracking-[.3em]" type="password" inputMode="numeric" value={pin} onChange={e=>setPin(e.target.value)} minLength={4} maxLength={80} required data-testid="input-admin-pin"/></label>{(login.isError||session.isError)&&<p className="text-center text-sm text-destructive" data-testid="error-admin-login">No se pudo validar el acceso. Revisa el PIN e inténtalo otra vez.</p>}<button disabled={login.isPending} className="btn-primary w-full py-3" data-testid="button-admin-login">{login.isPending?'Verificando…':'Entrar'}</button></form>
      {session.isError&&<button className="mt-3 w-full text-xs text-muted-foreground underline" onClick={()=>session.refetch()} data-testid="button-retry-session">Comprobar sesión</button>}
    </section>
    : <div>
      <div className="mb-5 flex items-center justify-between gap-3"><div className="admin-nav" role="tablist">{([['orders','Pedidos',ClipboardList],['menu','Carta',Utensils],['store','Restaurante',Settings]] as const).map(([key,label,Icon])=><button key={key} onClick={()=>setTab(key)} className={tab===key?'active':''} role="tab" aria-selected={tab===key} data-testid={`tab-admin-${key}`}><Icon className="mr-2 inline" size={15}/>{label}</button>)}</div><button onClick={()=>logout.mutate()} className="flex items-center gap-1 rounded-full px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted" disabled={logout.isPending} data-testid="button-admin-logout"><LogOut size={15}/> Salir</button></div>
      {tab==='orders'&&<div className="space-y-5">
        <section className="grid grid-cols-3 gap-2 sm:gap-4" data-testid="section-dashboard-metrics">{metrics.map(({label,metric})=><article key={label} className="soft-panel p-3 sm:p-5"><span className="eyebrow text-muted-foreground">{label}</span><strong className="serif mt-1 block text-xl sm:text-3xl">{money(metric?.revenueUsd||0)}</strong><small className="text-xs text-muted-foreground">{metric?.orders??'—'} pedidos</small></article>)}</section>
        {dashboard.data&&<div className="flex flex-wrap gap-x-4 gap-y-2 rounded-xl border border-border px-4 py-3 text-xs" data-testid="section-order-status-counts">{[['Pendientes',dashboard.data.statusCounts.pending],['Aprobados',dashboard.data.statusCounts.approved],['Preparando',dashboard.data.statusCounts.preparing],['Despachados',dashboard.data.statusCounts.dispatched],['Entregados',dashboard.data.statusCounts.delivered],['Cancelados',dashboard.data.statusCounts.cancelled]].map(([label,count])=><span key={String(label)} className="text-muted-foreground">{label}: <strong className="text-foreground">{count}</strong></span>)}</div>}
        {dashboard.isError&&<InlineError text="No se pudieron cargar los totales." retry={()=>dashboard.refetch()}/>}
        <section className="soft-panel p-4 sm:p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="serif text-2xl">Pedidos entrantes</h2><p className="text-xs text-muted-foreground">Actualización automática cada 8 segundos.</p></div><select className="field w-auto min-w-[160px]" value={orderFilter} onChange={e=>setOrderFilter(e.target.value)} data-testid="select-order-filter"><option value="">Todos los estados</option>{Object.entries(statusNames).map(([v,n])=><option value={v} key={v}>{n}</option>)}</select></div>
          {orders.isLoading?<div className="space-y-3">{[1,2,3].map(n=><div className="skeleton h-24" key={n}/>)}</div>:orders.isError?<InlineError text="No se pudieron cargar los pedidos." retry={()=>orders.refetch()}/>:orders.data?.length?<div className="space-y-3">{orders.data.map(order=><article className="rounded-xl border border-border p-4" key={order.id} data-testid={`admin-order-${order.id}`}><div className="flex flex-wrap justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><strong>#{order.id} · {order.customerName}</strong><StatusPill status={order.status}/></div><p className="mt-1 text-xs text-muted-foreground">{time(order.createdAt)} · {order.phone} · {order.customerId}</p></div><strong className="text-lg">{money(order.totalUsd)} <small className="text-xs font-normal text-muted-foreground">{moneyBs(order.totalBs)}</small></strong></div>
            <p className="mt-3 text-sm text-muted-foreground">{order.items.map(x=>`${x.quantity} × ${x.name}`).join(' · ')}</p><div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{order.address}</span><span>Ref. {order.paymentReference}</span></div>
            <div className="mt-4 flex flex-wrap gap-2">{nextStatuses(order.status).map(next=><button key={next} disabled={statusMutation.isPending} onClick={()=>statusMutation.mutate({id:order.id,data:{status:next as 'PENDIENTE'|'APROBADO'|'EN_PREPARACION'|'DESPACHADO'|'ENTREGADO'|'CANCELADO'}})} className={`rounded-full px-3 py-2 text-xs font-bold ${next==='CANCELADO'?'border border-destructive/30 text-destructive':'bg-secondary text-secondary-foreground'}`} data-testid={`button-order-${next.toLowerCase()}-${order.id}`}>{statusNames[next]}</button>)}</div>
          </article>)}</div>:<div className="rounded-xl bg-muted/50 p-8 text-center" data-testid="empty-admin-orders"><PackageCheck className="mx-auto text-secondary" size={28}/><p className="serif mt-2 text-xl">No hay pedidos en esta vista.</p><p className="mt-1 text-sm text-muted-foreground">Los pedidos nuevos aparecerán aquí.</p></div>}
          {statusMutation.isError&&<p className="mt-3 text-sm text-destructive" data-testid="error-update-order">No se pudo actualizar el estado. Inténtalo otra vez.</p>}
        </section>
      </div>}
      {tab==='menu'&&<section className="soft-panel p-4 sm:p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="serif text-2xl">Carta publicada</h2><p className="text-sm text-muted-foreground">Gestiona los platos que aparecen en el menú.</p></div><button className="btn-primary flex items-center gap-2 px-4 py-2.5 text-xs" onClick={()=>setEditing(null)} data-testid="button-add-product"><Plus size={15}/> Nuevo plato</button></div>
        {products.isLoading?<div className="space-y-3">{[1,2].map(n=><div className="skeleton h-20" key={n}/>)}</div>:products.isError?<InlineError text="No se pudo cargar la carta." retry={()=>products.refetch()}/>:products.data?.length?<div className="space-y-2">{products.data.map(p=><div key={p.id} className="flex items-center gap-3 rounded-xl border border-border p-3" data-testid={`admin-product-${p.id}`}>{p.photoUrl?<img src={p.photoUrl} alt="" className="h-14 w-14 rounded-lg object-cover"/>:<div className="grid h-14 w-14 place-items-center rounded-lg bg-muted"><Utensils size={18}/></div>}<div className="min-w-0 flex-1"><strong className="block truncate">{p.name}</strong><small className="text-muted-foreground">{p.category} · {money(productPrice(p))} · {p.available?'Disponible':'Pausado'}</small></div><button onClick={()=>setEditing(p)} className="rounded-full border border-border p-2" aria-label={`Editar ${p.name}`} data-testid={`button-edit-product-${p.id}`}><Pencil size={15}/></button><button onClick={()=>{if(confirm(`¿Eliminar ${p.name} de la carta?`))deleteProduct.mutate({id:p.id})}} className="rounded-full border border-border p-2 text-destructive" aria-label={`Eliminar ${p.name}`} data-testid={`button-delete-product-${p.id}`}><Trash2 size={15}/></button></div>)}</div>:<div className="rounded-xl bg-muted/50 p-8 text-center" data-testid="empty-admin-products"><Utensils className="mx-auto text-secondary" size={26}/><p className="serif mt-2 text-xl">La carta está vacía.</p><button className="mt-3 font-bold text-primary underline" onClick={()=>setEditing(null)}>Agregar primer plato</button></div>}
        {(createProduct.isError||updateProduct.isError||deleteProduct.isError)&&<p className="mt-3 text-sm text-destructive">No se pudo guardar el cambio de carta.</p>}
      </section>}
      {tab==='store'&&<section className="soft-panel p-4 sm:p-6"><div className="mb-5"><p className="eyebrow text-secondary">Información pública</p><h2 className="serif text-2xl">La casa y sus horarios</h2></div>
        {store.isLoading?<div className="space-y-3">{[1,2].map(i=><div className="skeleton h-12" key={i}/>)}</div>:store.isError?<InlineError text="No se pudo cargar la configuración." retry={()=>store.refetch()}/>:config&&<form onSubmit={storeSubmit} className="grid gap-4 sm:grid-cols-2" data-testid="form-store-settings">
          <Field label="Nombre del restaurante" name="name" required value={config.name} onChange={(e:ChangeEvent<HTMLInputElement>)=>setConfig({...config,name:e.target.value})}/>
          <Field label="URL del logo" name="logoUrl" value={config.logoUrl} onChange={(e:ChangeEvent<HTMLInputElement>)=>setConfig({...config,logoUrl:e.target.value})}/>
          <Field label="RIF" name="rif" value={config.rif} onChange={(e:ChangeEvent<HTMLInputElement>)=>setConfig({...config,rif:e.target.value})}/>
          <Field label="WhatsApp (código de país)" name="whatsapp" value={config.whatsapp} onChange={(e:ChangeEvent<HTMLInputElement>)=>setConfig({...config,whatsapp:e.target.value})}/>
          <Field label="Dirección" name="address" value={config.address} onChange={(e:ChangeEvent<HTMLInputElement>)=>setConfig({...config,address:e.target.value})}/>
          <Field label="Banco" name="bank" value={config.bank} onChange={(e:ChangeEvent<HTMLInputElement>)=>setConfig({...config,bank:e.target.value})}/>
          <Field label="ID de pago / cuenta" name="paymentId" value={config.paymentId} onChange={(e:ChangeEvent<HTMLInputElement>)=>setConfig({...config,paymentId:e.target.value})}/>
          <Field label="Teléfono pago móvil" name="paymentPhone" value={config.paymentPhone} onChange={(e:ChangeEvent<HTMLInputElement>)=>setConfig({...config,paymentPhone:e.target.value})}/>
          <Field label="Tasa de cambio Bs. por USD" name="exchangeRate" type="number" min="0.01" step="0.01" value={config.exchangeRate} onChange={(e:ChangeEvent<HTMLInputElement>)=>setConfig({...config,exchangeRate:Number(e.target.value)})}/>
          <Field label="Horario diario (24 h, ej. 11:00-22:00)" name="schedule" placeholder="11:00-22:00" value={config.schedule} onChange={(e:ChangeEvent<HTMLInputElement>)=>setConfig({...config,schedule:e.target.value})}/>
          <label className="flex items-center gap-3 rounded-xl border border-border p-4 text-sm font-semibold sm:col-span-2"><input type="checkbox" checked={config.manualOpen} onChange={e=>setConfig({...config,manualOpen:e.target.checked})} data-testid="toggle-store-open"/> Forzar restaurante abierto (anula el horario) <span className="ml-auto text-xs text-muted-foreground">{config.manualOpen?'Abierto':'Seguir horario'}</span></label>
          {store.data?.paymentConfigured===false&&<p className="rounded-xl bg-primary/5 p-3 text-sm sm:col-span-2" data-testid="notice-admin-payment-unconfigured">Pago móvil incompleto. Añade y confirma los datos bancarios para recibir pedidos.</p>}
          {updateStore.isError&&<p className="text-sm text-destructive sm:col-span-2" data-testid="error-store-save">No se pudo guardar la configuración.</p>}
          {updateStore.isSuccess&&<p className="text-sm font-semibold text-secondary sm:col-span-2" data-testid="success-store-save">Configuración guardada.</p>}
          <button disabled={updateStore.isPending} className="btn-primary py-3 text-sm sm:col-span-2" data-testid="button-save-store">{updateStore.isPending?'Guardando…':'Guardar cambios'}</button>
        </form>}
      </section>}
    </div>}
  </main>
  {editing!==false&&<ProductEditor product={editing||null} close={()=>setEditing(false)} submit={productSubmit} pending={createProduct.isPending||updateProduct.isPending}/>}
  </div>;
}
function nextStatuses(status:string) {
  if(status==='PENDIENTE')return ['APROBADO','CANCELADO'];
  if(status==='APROBADO')return ['EN_PREPARACION','CANCELADO'];
  if(status==='EN_PREPARACION')return ['DESPACHADO','CANCELADO'];
  if(status==='DESPACHADO')return ['ENTREGADO'];
  return [];
}
function StatusPill({status}:{status:string}){return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${status==='PENDIENTE'?'bg-amber-100 text-amber-900':status==='CANCELADO'?'bg-destructive/10 text-destructive':'bg-secondary/10 text-secondary'}`} data-testid={`status-pill-${status}`}>{statusNames[status]||status}</span>}
function InlineError({text,retry}: {text:string;retry:()=>void}) { return <div className="rounded-xl bg-destructive/5 p-4 text-sm" data-testid="inline-error"><p>{text}</p><button onClick={retry} className="mt-2 flex items-center gap-1 font-bold text-primary" data-testid="button-inline-retry"><RefreshCw size={13}/> Reintentar</button></div>; }
function ProductEditor({product,close,submit,pending}:{product:Product|null;close:()=>void;submit:(e:FormEvent<HTMLFormElement>)=>void;pending:boolean}) {
  return <div className="overlay" onClick={close}><section className="dialog" onClick={e=>e.stopPropagation()} data-testid="dialog-product-editor"><div className="mb-4 flex items-center justify-between"><div><p className="eyebrow text-primary">{product?'Actualizar':'Agregar a la carta'}</p><h2 className="serif text-2xl">{product?'Editar plato':'Nuevo plato'}</h2></div><button onClick={close} aria-label="Cerrar" className="rounded-full p-2 hover:bg-muted" data-testid="button-close-product-editor"><X size={19}/></button></div>
    <form onSubmit={submit} className="space-y-3" data-testid="form-product-editor">
      <Field label="Nombre" name="name" required defaultValue={product?.name||''}/>
      <label className="block text-sm font-semibold">Descripción<textarea className="field mt-1" name="description" maxLength={2000} defaultValue={product?.description||''} data-testid="input-product-description"/></label>
      <div className="grid grid-cols-2 gap-3"><Field label="Categoría" name="category" required defaultValue={product?.category||''}/><Field label="Precio USD" name="price" type="number" min="0.01" step="0.01" required defaultValue={product?.price||''}/></div>
      <div className="grid grid-cols-2 gap-3"><Field label="Precio oferta (opcional)" name="offerPrice" type="number" min="0.01" step="0.01" defaultValue={product?.offerPrice??''}/><Field label="URL de fotografía" name="photoUrl" defaultValue={product?.photoUrl||''}/></div>
      <label className="flex items-center gap-2 text-sm"><input name="available" type="checkbox" defaultChecked={product?.available??true} data-testid="input-product-available"/> Disponible para ordenar</label>
      <button disabled={pending} className="btn-primary w-full py-3 text-sm" data-testid="button-save-product">{pending?'Guardando…':'Guardar plato'}</button>
    </form>
  </section></div>;
}
function RoutedErrorBoundary({children}:{children:ReactNode}) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function Router() {
  return <RoutedErrorBoundary><Switch>
    <Route path="/" component={Home}/>
    <Route path="/pedido/:id" component={Tracking}/>
    <Route path="/admin" component={Admin}/>
    <Route component={NotFound}/>
  </Switch></RoutedErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,'')}><Router/></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}
export default App;
