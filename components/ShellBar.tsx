import Link from 'next/link';
import { getCurrentMember, displayName } from '@/lib/auth';
import { getCartLines, cartTotals } from '@/lib/cart';
import { signOut } from '@/app/login/actions';

export async function ShellBar() {
  const member = await getCurrentMember();
  const cartCount = member ? cartTotals((await getCartLines(member.id)).lines).count : 0;

  return (
    <header className="shellbar">
      <Link href="/" className="shellbar__brand" aria-label="Go to the store">
        <span className="shellbar__logo" aria-hidden="true">AO</span>
        <span className="shellbar__title">Audi Outcasts Store</span>
      </Link>

      {member && (
        <nav className="shellbar__nav" aria-label="Main">
          <Link href="/orders" className="shellbar__link">My Orders</Link>
          {member.role === 'admin' && (
            <>
              <Link href="/items" className="shellbar__link">Manage Items</Link>
              <Link href="/admin/orders" className="shellbar__link">Manage Orders</Link>
              <Link href="/admin/promotions" className="shellbar__link">Promotions</Link>
              <Link href="/admin/members-import" className="shellbar__link">Import Members</Link>
              <Link href="/admin/banking" className="shellbar__link">Banking Details</Link>
            </>
          )}
        </nav>
      )}

      <span className="toolbar__spacer" />

      {member && (
        <>
          <Link href="/cart" className="shellbar__cart"
            aria-label={cartCount ? `Cart, ${cartCount} items` : 'Cart, empty'}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path fill="currentColor" d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1.003 1.003 0 0 0 20 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z" />
            </svg>
            {cartCount > 0 && <span className="shellbar__badge">{cartCount > 99 ? '99+' : cartCount}</span>}
          </Link>

          <div className="shellbar__user">
            <span className="shellbar__avatar" aria-hidden="true">
              {displayName(member).slice(0, 1).toUpperCase()}
            </span>
            <span className="shellbar__username">{displayName(member)}</span>
            <form action={signOut}>
              <button type="submit" className="shellbar__signout">Sign out</button>
            </form>
          </div>
        </>
      )}
    </header>
  );
}
