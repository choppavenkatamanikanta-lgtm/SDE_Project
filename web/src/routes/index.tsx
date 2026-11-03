import { useCallback, useEffect, useState } from "react";

interface Share { id: string; memberId: string; amountCents: number; paidAt: string | null }
interface Bill { id: string; title: string; totalCents: number; shares: Share[] }
interface Member { id: string; name: string }

export function HomePage() {
  const [homeId, setHomeId] = useState(() => localStorage.getItem("shared-home-id") ?? "");
  const [homeName, setHomeName] = useState("");
  const [memberName, setMemberName] = useState("");
  const [title, setTitle] = useState("");
  const [total, setTotal] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const request = async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(url, init);
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const problem = data as { error?: string };
      throw new Error(problem.error ?? `Request failed (${response.status})`);
    }
    return data as T;
  };

  const loadHomeData = useCallback(async () => {
    if (!homeId) return;
    try {
      const [memberData, billData] = await Promise.all([
        request<{ members: Member[] }>(`/api/homes/${encodeURIComponent(homeId)}/members`),
        request<{ bills: Bill[] }>(`/api/homes/${encodeURIComponent(homeId)}/bills`),
      ]);
      setMembers(memberData.members);
      setBills(billData.bills);
      setMessage("");
    } catch (cause: unknown) {
      setMessage(cause instanceof Error ? cause.message : "Unable to load home data.");
    }
  }, [homeId]);

  useEffect(() => {
    if (homeId) {
      localStorage.setItem("shared-home-id", homeId);
      void loadHomeData();
    }
  }, [homeId, loadHomeData]);

  async function createHome(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = await request<{ id: string }>("/api/homes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: homeName }) });
      setHomeId(result.id); setHomeName(""); setMessage(`Home created. Save this ID to share it: ${result.id}`);
    } catch (cause: unknown) { setMessage(cause instanceof Error ? cause.message : "Could not create home."); }
    finally { setBusy(false); }
  }

  async function addMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await request(`/api/homes/${encodeURIComponent(homeId)}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: memberName }) });
      setMemberName(""); await loadHomeData();
    } catch (cause: unknown) { setMessage(cause instanceof Error ? cause.message : "Could not add member."); }
    finally { setBusy(false); }
  }

  async function createBill(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await request(`/api/homes/${encodeURIComponent(homeId)}/bills`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, totalCents: Math.round(Number(total) * 100) }) });
      setTitle(""); setTotal(""); await loadHomeData();
    } catch (cause: unknown) { setMessage(cause instanceof Error ? cause.message : "Could not create bill."); }
    finally { setBusy(false); }
  }

  async function payShare(billId: string, shareId: string) {
    setBusy(true); setMessage("");
    try {
      await request(`/api/bills/${billId}/shares/${shareId}/pay`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() } });
      await loadHomeData();
    } catch (cause: unknown) { setMessage(cause instanceof Error ? cause.message : "Payment failed."); }
    finally { setBusy(false); }
  }

  return (
    <main className="container">
      <h1>Shared Home Bill Splitter</h1>
      <p>Track household bills and split costs in whole cents.</p>
      {message && <p className="notice" role="status">{message}</p>}
      {!homeId ? <section className="card">
        <h2>Create a home</h2>
        <form onSubmit={createHome} className="form-row"><input aria-label="Home name" placeholder="Home name" value={homeName} onChange={(e) => setHomeName(e.target.value)} required /><button disabled={busy}>Create home</button></form>
        <p>Or enter an existing home ID:</p><input aria-label="Existing home ID" placeholder="Home ID" value={homeId} onChange={(e) => setHomeId(e.target.value)} />
      </section> : <>
        <section className="card"><h2>Home</h2><p><strong>Home ID:</strong> <code>{homeId}</code> <button className="secondary" onClick={() => { setHomeId(""); localStorage.removeItem("shared-home-id"); setMembers([]); setBills([]); }}>Switch home</button></p>
          <form onSubmit={addMember} className="form-row"><input aria-label="Member name" placeholder="Member name" value={memberName} onChange={(e) => setMemberName(e.target.value)} required /><button disabled={busy}>Add member</button></form>
          <h3>Members</h3>{members.length ? <ul>{members.map((m) => <li key={m.id}>{m.name}</li>)}</ul> : <p>No members yet.</p>}
        </section>
        <section className="card"><h2>Add a bill</h2><form onSubmit={createBill} className="form-row"><input aria-label="Bill title" placeholder="Bill title" value={title} onChange={(e) => setTitle(e.target.value)} required /><input aria-label="Total amount in dollars" type="number" min="0.01" step="0.01" placeholder="Total ($)" value={total} onChange={(e) => setTotal(e.target.value)} required /><button disabled={busy || members.length === 0}>Split bill</button></form>{members.length === 0 && <p>Add at least one member before creating a bill.</p>}</section>
        <section><h2>Bills</h2>{bills.length === 0 ? <p>No bills recorded for this home yet.</p> : bills.map((bill) => <article className="card" key={bill.id}><h3>{bill.title} <span className="amount">${(bill.totalCents / 100).toFixed(2)}</span></h3>{bill.shares.map((share) => <div className="share" key={share.id}><span>{members.find((member) => member.id === share.memberId)?.name ?? share.memberId.slice(0, 8)} — ${(share.amountCents / 100).toFixed(2)}</span>{share.paidAt ? <span className="paid">Paid</span> : <button disabled={busy} onClick={() => void payShare(bill.id, share.id)}>Pay share</button>}</div>)}</article>)}</section>
      </>}
    </main>
  );
}
