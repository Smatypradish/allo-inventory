"use client";

import { useState, useEffect, useCallback, use } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Package,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Warehouse,
  Hash,
  Timer,
  AlertTriangle,
  ShieldCheck,
  Ban,
} from "lucide-react";

interface ReservationData {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: "PENDING" | "CONFIRMED" | "RELEASED";
  expiresAt: string;
  createdAt: string;
  product?: {
    id: string;
    name: string;
    price: number;
    sku: string;
    description: string;
  };
  warehouse?: {
    id: string;
    name: string;
    location: string;
  };
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(price);
}

function CountdownTimer({
  expiresAt,
  onExpire,
}: {
  expiresAt: string;
  onExpire: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      return Math.max(0, Math.floor(diff / 1000));
    };

    setTimeLeft(calculateTimeLeft());

    const interval = setInterval(() => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onExpire();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const totalSeconds = Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - new Date(new Date(expiresAt).getTime() - 10 * 60 * 1000).getTime()) / 1000)
  );
  const progress = totalSeconds > 0 ? timeLeft / totalSeconds : 0;
  const circumference = 2 * Math.PI * 56;
  const offset = circumference * (1 - progress);

  let ringColor = "#10b981";
  if (timeLeft < 60) ringColor = "#ef4444";
  else if (timeLeft < 180) ringColor = "#f59e0b";

  return (
    <div className="countdown-ring">
      <svg width="140" height="140" viewBox="0 0 140 140">
        {/* Background circle */}
        <circle
          cx="70"
          cy="70"
          r="56"
          fill="none"
          stroke="rgba(0, 0, 0, 0.08)"
          strokeWidth="8"
        />
        {/* Progress circle */}
        <circle
          cx="70"
          cy="70"
          r="56"
          fill="none"
          stroke={ringColor}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s ease" }}
        />
      </svg>
      <div className="countdown-text" style={{ color: ringColor }}>
        {minutes}:{seconds.toString().padStart(2, "0")}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { className: string; icon: React.ReactNode; label: string }> = {
    PENDING: {
      className: "badge badge-warning",
      icon: <Clock size={12} />,
      label: "Pending",
    },
    CONFIRMED: {
      className: "badge badge-success",
      icon: <CheckCircle2 size={12} />,
      label: "Confirmed",
    },
    RELEASED: {
      className: "badge badge-danger",
      icon: <XCircle size={12} />,
      label: "Released",
    },
  };

  const c = config[status] || config.PENDING;

  return (
    <span className={c.className}>
      {c.icon}
      {c.label}
    </span>
  );
}

export default function ReservationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [reservation, setReservation] = useState<ReservationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  const fetchReservation = useCallback(async () => {
    try {
      const res = await fetch(`/api/reservations/${id}`);
      if (!res.ok) {
        toast.error("Reservation not found");
        return;
      }
      const data = await res.json();
      setReservation(data);

      if (data.status === "RELEASED") {
        setExpired(true);
      }
    } catch {
      toast.error("Failed to load reservation");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchReservation();
  }, [fetchReservation]);

  const handleConfirm = async () => {
    setActionLoading("confirm");
    try {
      const res = await fetch(`/api/reservations/${id}/confirm`, {
        method: "POST",
      });

      const data = await res.json();

      if (res.status === 410) {
        toast.error("Reservation Expired", {
          description: data.error,
          icon: <AlertTriangle size={18} />,
        });
        setExpired(true);
        await fetchReservation();
        return;
      }

      if (!res.ok) {
        toast.error("Confirmation Failed", {
          description: data.error,
        });
        return;
      }

      toast.success("Purchase Confirmed!", {
        description: data.message,
        icon: <ShieldCheck size={18} />,
      });

      await fetchReservation();
    } catch {
      toast.error("Network Error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRelease = async () => {
    setActionLoading("release");
    try {
      const res = await fetch(`/api/reservations/${id}/release`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error("Release Failed", {
          description: data.error,
        });
        return;
      }

      toast.success("Reservation Cancelled", {
        description: "Units have been released back to inventory",
        icon: <Ban size={18} />,
      });

      await fetchReservation();
    } catch {
      toast.error("Network Error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleExpire = useCallback(() => {
    setExpired(true);
    toast.error("Reservation Expired", {
      description: "Your reservation has expired. The units have been released.",
      icon: <Timer size={18} />,
    });
    fetchReservation();
  }, [fetchReservation]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div className="skeleton" style={{ width: 140, height: 140, borderRadius: "50%", margin: "0 auto 24px" }} />
          <div className="skeleton" style={{ width: 200, height: 20, margin: "0 auto 12px" }} />
          <div className="skeleton" style={{ width: 160, height: 14, margin: "0 auto" }} />
        </div>
      </div>
    );
  }

  if (!reservation) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="glass-card" style={{ padding: 48, textAlign: "center", maxWidth: 400 }}>
          <XCircle size={48} style={{ color: "var(--danger)", margin: "0 auto 16px" }} />
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Reservation Not Found</h2>
          <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 24 }}>
            This reservation doesn&apos;t exist or has been removed.
          </p>
          <button className="btn-primary" onClick={() => router.push("/")}>
            <ArrowLeft size={16} />
            Back to Products
          </button>
        </div>
      </div>
    );
  }

  const isPending = reservation.status === "PENDING" && !expired;
  const isConfirmed = reservation.status === "CONFIRMED";
  const isReleased = reservation.status === "RELEASED" || expired;

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
            maxWidth: 800,
            margin: "0 auto",
            padding: "16px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", color: "#111827" }}>
                allo<span style={{ color: "#7c3ade" }}>health</span>
              </h1>
            </div>
          </div>

          {/* Navigation Links in Center */}
          <nav style={{ display: "flex", alignItems: "center", gap: 28, margin: "0 auto" }}>
            <a
              href="/"
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
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>Checkout</span>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px" }}>
        <div className="animate-slide-up">
          {/* Timer section */}
          <div
            className="glass-card"
            style={{
              padding: 40,
              textAlign: "center",
              marginBottom: 24,
            }}
          >
            {isPending && (
              <>
                <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 20, fontWeight: 500 }}>
                  Time remaining to complete your purchase
                </p>
                <CountdownTimer expiresAt={reservation.expiresAt} onExpire={handleExpire} />
                <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 16 }}>
                  Reservation will be automatically released when the timer expires
                </p>
              </>
            )}

            {isConfirmed && (
              <>
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: "50%",
                    background: "var(--success-glow)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 20px",
                  }}
                >
                  <CheckCircle2 size={40} style={{ color: "var(--success)" }} />
                </div>
                <h2 style={{ fontSize: 24, fontWeight: 800, color: "var(--success)", marginBottom: 8 }}>
                  Purchase Confirmed!
                </h2>
                <p style={{ color: "var(--muted)", fontSize: 14 }}>
                  Your order has been successfully processed
                </p>
              </>
            )}

            {isReleased && !isConfirmed && (
              <>
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: "50%",
                    background: "var(--danger-glow)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 20px",
                  }}
                >
                  <XCircle size={40} style={{ color: "var(--danger)" }} />
                </div>
                <h2 style={{ fontSize: 24, fontWeight: 800, color: "var(--danger)", marginBottom: 8 }}>
                  Reservation Released
                </h2>
                <p style={{ color: "var(--muted)", fontSize: 14 }}>
                  Units have been returned to available stock
                </p>
              </>
            )}
          </div>

          {/* Reservation details */}
          <div className="glass-card" style={{ padding: 28, marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Reservation Details</h3>
              <StatusBadge status={reservation.status} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <p style={{ color: "var(--muted)", fontSize: 12, fontWeight: 500, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  <Hash size={12} /> Reservation ID
                </p>
                <p style={{ fontSize: 13, fontWeight: 600, fontFamily: "monospace" }}>
                  {reservation.id.slice(0, 16)}...
                </p>
              </div>

              <div>
                <p style={{ color: "var(--muted)", fontSize: 12, fontWeight: 500, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  <Package size={12} /> Product
                </p>
                <p style={{ fontSize: 13, fontWeight: 600 }}>
                  {reservation.product?.name || reservation.productId}
                </p>
                {reservation.product && (
                  <p style={{ fontSize: 12, color: "var(--primary-hover)" }}>
                    {reservation.product.sku} — {formatPrice(reservation.product.price)}
                  </p>
                )}
              </div>

              <div>
                <p style={{ color: "var(--muted)", fontSize: 12, fontWeight: 500, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  <Warehouse size={12} /> Warehouse
                </p>
                <p style={{ fontSize: 13, fontWeight: 600 }}>
                  {reservation.warehouse?.name || reservation.warehouseId}
                </p>
                {reservation.warehouse && (
                  <p style={{ fontSize: 12, color: "var(--muted)" }}>
                    {reservation.warehouse.location}
                  </p>
                )}
              </div>

              <div>
                <p style={{ color: "var(--muted)", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                  Quantity
                </p>
                <p style={{ fontSize: 20, fontWeight: 800 }}>
                  {reservation.quantity} unit{reservation.quantity > 1 ? "s" : ""}
                </p>
              </div>

              {reservation.product && (
                <div>
                  <p style={{ color: "var(--muted)", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                    Total Amount
                  </p>
                  <p className="gradient-text" style={{ fontSize: 20, fontWeight: 800 }}>
                    {formatPrice(reservation.product.price * reservation.quantity)}
                  </p>
                </div>
              )}

              <div>
                <p style={{ color: "var(--muted)", fontSize: 12, fontWeight: 500, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  <Clock size={12} /> Created At
                </p>
                <p style={{ fontSize: 13, fontWeight: 500 }}>
                  {new Date(reservation.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          {isPending && (
            <div style={{ display: "flex", gap: 16 }}>
              <button
                className="btn-danger"
                onClick={handleRelease}
                disabled={actionLoading !== null}
                style={{ flex: 1, padding: "14px 24px", fontSize: 15 }}
              >
                <XCircle size={18} />
                {actionLoading === "release" ? "Cancelling..." : "Cancel Reservation"}
              </button>
              <button
                className="btn-success"
                onClick={handleConfirm}
                disabled={actionLoading !== null}
                style={{ flex: 1, padding: "14px 24px", fontSize: 15 }}
              >
                <CheckCircle2 size={18} />
                {actionLoading === "confirm" ? "Confirming..." : "Confirm Purchase"}
              </button>
            </div>
          )}

          {(isConfirmed || isReleased) && (
            <button
              className="btn-primary"
              onClick={() => router.push("/")}
              style={{ width: "100%", padding: "14px 24px", fontSize: 15 }}
            >
              <ArrowLeft size={18} />
              Back to Products
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
