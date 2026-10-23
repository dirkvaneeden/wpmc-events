import Link from 'next/link';
import { requireMember, displayName } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCartLines } from '@/lib/cart';
import type { CatalogueItem } from '@/lib/types';
import { AddToCartDialog } from '@/components/AddToCartDialog';
import { Price } from '@/components/Price';
import { PromotionQueue } from '@/components/PromotionPopup';
import { getPromotionsForMember } from '@/lib/promotions';

export const dynamic = 'force-dynamic';

export default async function StorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const member = await requireMember();
  const { q = '' } = await searchParams;
  const term = q.trim().slice(0, 60);

  // The catalogue view only contains active (not deleted) items
  let query = supabaseAdmin()
    .from('catalogue')
    .select('id, name, description, image_url, selling_price, sizes, colours, regular_price, discount_percent')
    .order('name');
  if (term) query = query.ilike('name', `%${term.replace(/[\\%_]/g, (c) => '\\' + c)}%`);

  const [{ data, error }, cart, promotions] = await Promise.all([
    query, getCartLines(member.id), getPromotionsForMember(member.id),
  ]);
  const items = (data ?? []) as CatalogueItem[];
  // Quantity in the cart per item, across all its sizes and colours
  const inCart = new Map<string, number>();
  for (const l of cart.lines) inCart.set(l.item_id, (inCart.get(l.item_id) ?? 0) + l.quantity);

  return (
    <>
      <div className="page-header">
        <h1 className="page-header__title">Store</h1>
        <p className="page-header__subtitle">Welcome, {displayName(member)}</p>
        {/* Shortcuts, mainly for phones where the shell bar links are hidden */}
        <nav className="page-header__links" aria-label="Shortcuts">
          <Link href="/orders" className="page-header__link">My Orders</Link>
          {member.role === 'admin' && (
            <>
              <Link href="/items" className="page-header__link">Manage Items</Link>
              <Link href="/admin/orders" className="page-header__link">Manage Orders</Link>
              <Link href="/admin/promotions" className="page-header__link">Promotions</Link>
              <Link href="/admin/members-import" className="page-header__link">Import Members</Link>
              <Link href="/admin/banking" className="page-header__link">Banking Details</Link>
            </>
          )}
        </nav>
      </div>

      <div className="page-body">
        {error && (
          <div className="message-strip message-strip--error" role="alert">
            The store could not be loaded: {error.message}
          </div>
        )}

        <section className="panel">
          <div className="toolbar toolbar--wrap">
            <h2 className="toolbar__title">
              {term ? `Results for “${term}” (${items.length})` : `Items (${items.length})`}
            </h2>
            <span className="toolbar__spacer" />
            <form className="search" role="search" action="/">
              <label htmlFor="q" className="sr-only">Search items</label>
              <input id="q" name="q" type="search" className="input search__input"
                placeholder="Search" defaultValue={term} />
              <button type="submit" className="btn">Search</button>
            </form>
          </div>

          {items.length === 0 ? (
            <div className="no-data">
              <p>{term ? 'No items match your search.' : 'There are no items in the store yet.'}</p>
              {term && <Link href="/" className="btn">Show all items</Link>}
            </div>
          ) : (
            <ul className="catalogue">
              {items.map((item) => (
                <li key={item.id} className="product">
                  <div className="product__image">
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image_url} alt={item.name} loading="lazy" />
                    ) : (
                      <span className="product__noimage">No image</span>
                    )}
                  </div>
                  <div className="product__body">
                    <h3 className="product__name">{item.name}</h3>
                    {item.description && <p className="product__desc">{item.description}</p>}
                    {(item.sizes?.length > 0 || item.colours?.length > 0) && (
                      <p className="product__options">
                        {item.sizes?.length > 0 && <span>{item.sizes.length === 1 ? item.sizes[0] : `${item.sizes[0]}–${item.sizes[item.sizes.length - 1]}`}</span>}
                        {item.colours?.length > 0 && <span>{item.colours.length === 1 ? item.colours[0] : `${item.colours.length} colours`}</span>}
                      </p>
                    )}
                    <p className="product__price">
                      <Price price={item.selling_price} regular={item.regular_price} discount={item.discount_percent} />
                    </p>
                    <AddToCartDialog item={item} inCart={inCart.get(item.id) ?? 0} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {/* Pop-up for promotions this member hasn't responded to yet.
          Always rendered, so it stays open while the page refreshes after "Add to Cart". */}
      <PromotionQueue promotions={promotions} />
    </>
  );
}
