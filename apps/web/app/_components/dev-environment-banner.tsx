import { DEVELOPMENT_NETWORK_LABEL } from '../../lib/env';

/**
 * Clear development/testnet labeling. This build only talks to the off-chain
 * registry — it must not be mistaken for a production marketplace.
 */
export function DevEnvironmentBanner() {
  return (
    <div className="dev-banner" role="note">
      <strong>Development build</strong> · {DEVELOPMENT_NETWORK_LABEL} · Off-chain registry only —
      on-chain identity (ERC-8004) and payments are not active yet.
    </div>
  );
}
