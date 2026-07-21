"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type CartBadge = {
  cartCount: number;
  cartTotal: number;
  setCartBadge: (next: { cartCount: number; cartTotal: number }) => void;
};

const Ctx = createContext<CartBadge>({
  cartCount: 0,
  cartTotal: 0,
  setCartBadge: () => {},
});

export function useCartBadge() {
  return useContext(Ctx);
}

/** Optimistic cart count/total for the buyer topbar — updated on add without waiting for RSC refresh. */
export function CartBadgeProvider({
  cartCount: initialCount,
  cartTotal: initialTotal,
  children,
}: {
  cartCount: number;
  cartTotal: number;
  children: React.ReactNode;
}) {
  const [cartCount, setCount] = useState(initialCount);
  const [cartTotal, setTotal] = useState(initialTotal);

  useEffect(() => {
    setCount(initialCount);
    setTotal(initialTotal);
  }, [initialCount, initialTotal]);

  const setCartBadge = useCallback((next: { cartCount: number; cartTotal: number }) => {
    setCount(Math.max(0, Math.floor(next.cartCount) || 0));
    setTotal(Math.max(0, Number(next.cartTotal) || 0));
  }, []);

  const value = useMemo(
    () => ({ cartCount, cartTotal, setCartBadge }),
    [cartCount, cartTotal, setCartBadge],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
