import { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';
import { colors } from '../theme';

/**
 * "Deslizar hacia abajo para refrescar" para un ScrollView: devuelve el RefreshControl.
 * El indicador solo se muestra mientras corre el refresco que pidió el usuario (no en
 * los refrescos automáticos cada 15-30 s, que también cambian isFetching).
 */
export function usePullRefresh(refresh: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.brand]} tintColor={colors.brand} />;
}
