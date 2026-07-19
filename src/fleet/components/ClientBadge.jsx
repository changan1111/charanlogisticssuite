import { CLIENT_CONFIG } from '../lib/constants';
import { clientByKey } from '../lib/clientDetect';

export function ClientBadge({ clientKey }) {
  const c = clientByKey(clientKey);
  return (
    <span
      className="client-tag"
      style={{ color: c.color, background: c.hex + '22', border: `1px solid ${c.hex}55` }}
    >
      {c.label}
    </span>
  );
}

export function ClientPills() {
  return (
    <div className="client-pills">
      {CLIENT_CONFIG.map(c => (
        <span
          key={c.key}
          className="pill"
          style={{ background: c.hex + '22', color: c.color, border: `1px solid ${c.hex}44` }}
        >
          ● {c.label.toUpperCase()}
        </span>
      ))}
    </div>
  );
}
