import { createContext, useContext, useState, useCallback } from 'react';
import { getActiveVehicles } from '../lib/dataLayer';

// Holds the active VEHICLES list (was global `VEHICLES` in v1)
const FleetContext = createContext({ vehicles: [], reloadVehicles: () => {} });

export function FleetProvider({ children }) {
  const [vehicles, setVehicles] = useState([]);

  const reloadVehicles = useCallback(async () => {
    try {
      const rows = await getActiveVehicles();
      setVehicles(rows.map(r => r.number));
    } catch (e) {
      console.error('Could not load vehicles:', e.message);
    }
  }, []);

  return (
    <FleetContext.Provider value={{ vehicles, reloadVehicles }}>
      {children}
    </FleetContext.Provider>
  );
}

export function useFleet() {
  return useContext(FleetContext);
}
