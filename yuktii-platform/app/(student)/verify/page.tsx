'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function VerifyLookupPage() {
  const router = useRouter();
  const [id, setId] = useState('');

  return (
    <div className="mx-auto max-w-lg px-5 py-20">
      <div className="text-center mb-10">
        <div className="text-4xl mb-4">🔍</div>
        <p className="badge badge-teal mx-auto mb-4">CERTIFICATE VERIFICATION</p>
        <h1 className="font-display text-3xl font-semibold">Verify a certificate</h1>
        <p className="text-ink/60 text-sm mt-3 max-w-sm mx-auto">
          Enter the certificate ID printed on the certificate, or scan the QR code to be taken here automatically.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (id.trim()) router.push(`/verify/${id.trim().toUpperCase()}`);
        }}
        className="glass rounded-2xl border border-line p-6 shadow-lg"
      >
        <label htmlFor="cert-id" className="block text-sm font-medium mb-2">
          Certificate ID
        </label>
        <input
          id="cert-id"
          value={id}
          onChange={(e) => setId(e.target.value.toUpperCase())}
          placeholder="e.g. A1B2C3"
          className="input-field stage-id text-lg tracking-widest text-center mb-4"
        />
        <button
          type="submit"
          disabled={!id.trim()}
          className="btn-primary w-full disabled:opacity-50"
        >
          Verify certificate →
        </button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-xs text-ink/40">
          The certificate ID is a unique alphanumeric code found below the student&apos;s name on the certificate.
          QR codes on certificates link directly to the verification page.
        </p>
      </div>
    </div>
  );
}
