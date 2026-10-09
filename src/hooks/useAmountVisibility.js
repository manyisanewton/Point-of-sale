import { useEffect, useState } from 'react';

const STORAGE_KEY = 'openDoorsHideAmounts';
const CHANGE_EVENT = 'open-doors-amount-visibility-change';

function readHiddenPreference() {
  return localStorage.getItem(STORAGE_KEY) !== 'false';
}

export function useAmountVisibility() {
  const [amountsHidden, setAmountsHidden] = useState(readHiddenPreference);

  useEffect(() => {
    const syncPreference = () => setAmountsHidden(readHiddenPreference());
    window.addEventListener(CHANGE_EVENT, syncPreference);
    window.addEventListener('storage', syncPreference);
    return () => {
      window.removeEventListener(CHANGE_EVENT, syncPreference);
      window.removeEventListener('storage', syncPreference);
    };
  }, []);

  function toggleAmounts() {
    const nextHidden = !amountsHidden;
    localStorage.setItem(STORAGE_KEY, String(nextHidden));
    setAmountsHidden(nextHidden);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return { amountsHidden, toggleAmounts };
}
