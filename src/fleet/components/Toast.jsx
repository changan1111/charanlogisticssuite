import { useRef, useState, useCallback } from 'react';

// useToast — same look/behaviour as the old toast(id,msg,ok)
export function useToast() {
  const [state, setState] = useState(null); // {msg, ok}
  const timerRef = useRef(null);

  const showToast = useCallback((msg, ok) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState({ msg, ok });
    timerRef.current = setTimeout(() => setState(null), 3500);
  }, []);

  const ToastEl = ({ style }) =>
    state ? (
      <div className={'toast ' + (state.ok ? 'ok' : 'err')} style={{ display: 'block', ...style }}>
        {(state.ok ? '✓ ' : '✗ ') + state.msg}
      </div>
    ) : null;

  return [ToastEl, showToast];
}
