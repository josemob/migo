import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from './ui';
import { colors, radius } from '../theme';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Última línea de defensa: si una pantalla lanza durante el render, en vez de
 * cerrar la app mostramos un mensaje amable con opción de reintentar.
 * Montar una sola vez en la raíz (App.tsx).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error?.message, info?.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.wrap}>
        <View style={styles.card}>
          <Text style={styles.emoji}>🐾</Text>
          <Text style={styles.title}>Algo salió mal</Text>
          <Text style={styles.msg}>
            Ocurrió un error inesperado. Toca “Reintentar” para continuar; si persiste, cierra y vuelve a abrir Migo.
          </Text>
          {__DEV__ ? <Text style={styles.detail}>{String(this.state.error.message)}</Text> : null}
          <Button title="Reintentar" onPress={this.reset} />
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, backgroundColor: colors.white, borderRadius: radius.lg, padding: 24, gap: 12, alignItems: 'center' },
  emoji: { fontSize: 40 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  msg: { fontSize: 15, color: colors.muted, textAlign: 'center', lineHeight: 21 },
  detail: { fontSize: 12, color: colors.red, textAlign: 'center' },
});
