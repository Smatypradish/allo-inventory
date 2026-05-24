"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Package,
  Warehouse,
  ShoppingCart,
  RefreshCw,
  TrendingUp,
  Box,
  ChevronDown,
  X,
  Minus,
  Plus,
} from "lucide-react";

interface InventoryItem {
  id: string;
  warehouseId: string;
  warehouseName: string;
  warehouseLocation: string;
  total: number;
  reserved: number;
  available: number;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  sku: string;
  imageUrl: string;
  inventory: InventoryItem[];
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(price);
}

function StockBar({ available, total }: { available: number; total: number }) {
  const percentage = total > 0 ? (available / total) * 100 : 0;
  let color = "#10b981";
  if (percentage < 25) color = "#ef4444";
  else if (percentage < 50) color = "#f59e0b";

  return (
    <div className="stock-bar" style={{ width: "100%" }}>
      <div
        className="stock-bar-fill"
        style={{
          width: `${percentage}%`,
          background: `linear-gradient(90deg, ${color}, ${color}dd)`,
        }}
      />
    </div>
  );
}

function ReserveModal({
  product,
  inventory,
  onClose,
}: {
  product: Product;
  inventory: InventoryItem;
  onClose: () => void;
}) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);

  const handleReserve = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          warehouseId: inventory.warehouseId,
          quantity,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        toast.error("Insufficient Stock", {
          description: data.error,
        });
        setLoading(false);
        return;
      }

      if (!res.ok) {
        toast.error("Reservation Failed", {
          description: data.error || "Something went wrong",
        });
        setLoading(false);
        return;
      }

      toast.success("Reservation Created!", {
        description: `${quantity} unit(s) of ${product.name} reserved for ${data.expiresIn}`,
      });

      // Navigate to checkout page
      router.push(`/reservation/${data.reservation.id}`);
    } catch {
      toast.error("Network Error", {
        description: "Failed to connect to the server",
      });
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>Reserve Units</h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--muted)",
              cursor: "pointer",
              padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 4 }}>Product</p>
          <p style={{ fontWeight: 600, fontSize: 16 }}>{product.name}</p>
          <p style={{ color: "var(--primary-hover)", fontSize: 14, marginTop: 2 }}>{formatPrice(product.price)}</p>
        </div>

        <div style={{ marginBottom: 20 }}>
          <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 4 }}>Warehouse</p>
          <p style={{ fontWeight: 600, fontSize: 14 }}>{inventory.warehouseName}</p>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>{inventory.warehouseLocation}</p>
        </div>

        <div style={{ marginBottom: 20 }}>
          <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 4 }}>
            Available: <span style={{ color: "var(--success)", fontWeight: 600 }}>{inventory.available}</span> units
          </p>
        </div>

        <div style={{ marginBottom: 28 }}>
          <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 8 }}>Quantity</p>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              className="btn-outline"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              style={{ padding: "8px 12px" }}
            >
              <Minus size={16} />
            </button>
            <input
              type="number"
              className="input-field"
              value={quantity}
              min={1}
              max={inventory.available}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 1;
                setQuantity(Math.min(Math.max(1, val), inventory.available));
              }}
              style={{ width: 80, textAlign: "center" }}
            />
            <button
              className="btn-outline"
              onClick={() => setQuantity(Math.min(inventory.available, quantity + 1))}
              style={{ padding: "8px 12px" }}
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <button className="btn-outline" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleReserve}
            disabled={loading || quantity < 1 || quantity > inventory.available}
            style={{ flex: 1 }}
          >
            {loading ? (
              <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <ShoppingCart size={16} />
            )}
            {loading ? "Reserving..." : `Reserve ${quantity} unit(s)`}
          </button>
        </div>

        <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 16, textAlign: "center" }}>
          Units will be held for the reservation period. Confirm payment to complete your purchase.
        </p>
      </div>
    </div>
  );
}

function ProductCard({
  product,
  index,
}: {
  product: Product;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [reserveTarget, setReserveTarget] = useState<InventoryItem | null>(null);
  const totalAvailable = product.inventory.reduce((sum, inv) => sum + inv.available, 0);

  return (
    <>
      <div
        className="glass-card animate-fade-in"
        style={{
          padding: 0,
          overflow: "hidden",
          animationDelay: `${index * 80}ms`,
          opacity: 0,
        }}
      >
        {/* Product image */}
        {/* Product image */}
        <div className="product-image-container">
          <div
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              zIndex: 2,
            }}
          >
            <span className={`badge ${totalAvailable > 0 ? "badge-success" : "badge-danger"}`}>
              {totalAvailable > 0 ? `${totalAvailable} available` : "Out of stock"}
            </span>
          </div>
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="product-image-img"
            />
          ) : (
            <>
              <Package size={64} style={{ color: "var(--primary)", opacity: 0.4 }} />
              <Box
                size={32}
                style={{
                  color: "var(--accent)",
                  opacity: 0.3,
                  position: "absolute",
                  bottom: 20,
                  right: 30,
                }}
              />
            </>
          )}
        </div>

        {/* Product info */}
        <div style={{ padding: "20px 24px" }}>
          <div style={{ marginBottom: 4 }}>
            <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 500, letterSpacing: "0.05em" }}>
              {product.sku}
            </span>
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{product.name}</h3>
          <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5, marginBottom: 16, minHeight: 40 }}>
            {product.description?.slice(0, 100)}
            {(product.description?.length || 0) > 100 ? "..." : ""}
          </p>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span className="gradient-text" style={{ fontSize: 24, fontWeight: 800 }}>
              {formatPrice(product.price)}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--muted)", fontSize: 13 }}>
              <Warehouse size={14} />
              {product.inventory.length} warehouses
            </div>
          </div>

          {/* Warehouse stock accordion */}
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(0, 0, 0, 0.04)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "10px 16px",
              color: "var(--foreground)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "Inter, system-ui, sans-serif",
              marginBottom: expanded ? 12 : 0,
              transition: "all 0.2s ease",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <TrendingUp size={14} style={{ color: "var(--primary)" }} />
              Stock by Warehouse
            </span>
            <ChevronDown
              size={16}
              style={{
                transition: "transform 0.2s ease",
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>

          {expanded && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, animation: "fadeIn 0.2s ease" }}>
              {product.inventory.map((inv) => (
                <div
                  key={inv.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: "rgba(0, 0, 0, 0.02)",
                    borderRadius: 10,
                    border: "1px solid rgba(0, 0, 0, 0.05)",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{inv.warehouseName}</p>
                    <p style={{ fontSize: 11, color: "var(--muted)" }}>{inv.warehouseLocation}</p>
                    <div style={{ marginTop: 6 }}>
                      <StockBar available={inv.available} total={inv.total} />
                    </div>
                    <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                      {inv.available} / {inv.total} available
                      {inv.reserved > 0 && (
                        <span style={{ color: "var(--warning)", marginLeft: 6 }}>
                          ({inv.reserved} reserved)
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    className="btn-primary"
                    onClick={() => setReserveTarget(inv)}
                    disabled={inv.available === 0}
                    style={{ padding: "8px 16px", fontSize: 12, marginLeft: 12 }}
                  >
                    <ShoppingCart size={14} />
                    Reserve
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {reserveTarget && (
        <ReserveModal
          product={product}
          inventory={reserveTarget}
          onClose={() => setReserveTarget(null)}
        />
      )}
    </>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 24 }}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="skeleton" style={{ height: 180, borderRadius: 0 }} />
          <div style={{ padding: "20px 24px" }}>
            <div className="skeleton" style={{ height: 12, width: "30%", marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 20, width: "70%", marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 40, width: "100%", marginBottom: 16 }} />
            <div className="skeleton" style={{ height: 28, width: "40%", marginBottom: 16 }} />
            <div className="skeleton" style={{ height: 44, width: "100%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProducts = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/products");
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setProducts(data);
      } else {
        toast.error(data.error || "Failed to load products");
      }
    } catch {
      toast.error("Failed to load products");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => fetchProducts(), 15000);
    return () => clearInterval(interval);
  }, [fetchProducts]);

  const totalProducts = products.length;
  const totalStock = products.reduce(
    (sum, p) => sum + p.inventory.reduce((s, i) => s + i.available, 0),
    0
  );
  const totalWarehouses = new Set(
    products.flatMap((p) => p.inventory.map((i) => i.warehouseId))
  ).size;

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid #e5e7eb",
          background: "rgba(255, 255, 255, 0.8)",
          backdropFilter: "blur(20px)",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "16px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Package size={22} color="white" />
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>
                Allo <span className="gradient-text">Inventory</span>
              </h1>
              <p style={{ fontSize: 12, color: "var(--muted)", marginTop: -2 }}>
                Reservation System
              </p>
            </div>
          </div>

          {/* Navigation Links in Center */}
          <nav style={{ display: "flex", alignItems: "center", gap: 28, margin: "0 auto" }}>
            <a
              href="#"
              style={{
                color: "var(--foreground)",
                fontWeight: 600,
                fontSize: 14,
                textDecoration: "none",
                transition: "color 0.2s ease",
              }}
              className="nav-link"
            >
              Products
            </a>
            <a
              href="#"
              style={{
                color: "var(--muted)",
                fontWeight: 500,
                fontSize: 14,
                textDecoration: "none",
                transition: "color 0.2s ease",
              }}
              className="nav-link"
            >
              Warehouses
            </a>
            <a
              href="#"
              style={{
                color: "var(--muted)",
                fontWeight: 500,
                fontSize: 14,
                textDecoration: "none",
                transition: "color 0.2s ease",
              }}
              className="nav-link"
            >
              My Reservations
            </a>
          </nav>

          <button
            className="btn-outline"
            onClick={() => fetchProducts(true)}
            disabled={refreshing}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px" }}
          >
            <RefreshCw
              size={14}
              style={{
                animation: refreshing ? "spin 1s linear infinite" : "none",
              }}
            />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      {/* Main content */}
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>
        {/* Stats bar */}
        <div
          className="animate-fade-in"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16,
            marginBottom: 32,
          }}
        >
          {[
            {
              label: "Total Products",
              value: totalProducts,
              icon: <Package size={20} />,
              color: "var(--primary)",
              bgGradient: "linear-gradient(135deg, #ffffff 50%, rgba(124, 58, 237, 0.04) 100%)",
            },
            {
              label: "Available Stock",
              value: totalStock.toLocaleString(),
              icon: <TrendingUp size={20} />,
              color: "var(--success)",
              bgGradient: "linear-gradient(135deg, #ffffff 50%, rgba(16, 185, 129, 0.04) 100%)",
            },
            {
              label: "Warehouses",
              value: totalWarehouses,
              icon: <Warehouse size={20} />,
              color: "var(--accent)",
              bgGradient: "linear-gradient(135deg, #ffffff 50%, rgba(219, 39, 119, 0.04) 100%)",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="glass-card"
              style={{
                padding: "20px 24px",
                display: "flex",
                alignItems: "center",
                gap: 16,
                background: stat.bgGradient,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: `${stat.color}18`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: stat.color,
                }}
              >
                {stat.icon}
              </div>
              <div>
                <p style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>{stat.label}</p>
                <p style={{ fontSize: 24, fontWeight: 800 }}>{stat.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Section header */}
        <div style={{ marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700 }}>Products</h2>
            <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>
              Browse products and reserve units from available warehouses
            </p>
          </div>
        </div>

        {/* Product grid */}
        {loading ? (
          <LoadingSkeleton />
        ) : products.length === 0 ? (
          <div
            className="glass-card"
            style={{
              padding: 60,
              textAlign: "center",
            }}
          >
            <Package size={48} style={{ color: "var(--muted)", marginBottom: 16, margin: "0 auto 16px" }} />
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No Products Found</h3>
            <p style={{ color: "var(--muted)", fontSize: 14 }}>
              The inventory appears to be empty. Seed the database to get started.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
              gap: 24,
            }}
          >
            {products.map((product, index) => (
              <ProductCard key={product.id} product={product} index={index} />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid var(--border)",
          padding: "24px",
          textAlign: "center",
          color: "var(--muted)",
          fontSize: 13,
          marginTop: 60,
        }}
      >
        <p>
          Built with Next.js, Prisma, and PostgreSQL —{" "}
          <span className="gradient-text" style={{ fontWeight: 600 }}>
            Allo Health Engineering
          </span>
        </p>
      </footer>

      <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
