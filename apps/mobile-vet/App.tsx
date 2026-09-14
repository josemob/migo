import 'react-native-gesture-handler';
import { useEffect, useState } from 'react';
import { AppState, View, type AppStateStatus } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import NetInfo from '@react-native-community/netinfo';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider, focusManager, onlineManager, useQuery } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';

import { OUTFIT_FONTS, enableOutfit } from './src/lib/fonts';
import { registerForPush } from './src/lib/push';
import { AuthProvider, useAuth } from './src/lib/auth';
import { StreamProvider } from './src/lib/stream';
import { IndependentBackContext } from './src/lib/independentMode';
import { IndependentVideoProvider } from './src/lib/vetVideo';
import { api } from './src/lib/api';
import { DialogHost } from './src/lib/dialog';
import { Button, Loading, Muted } from './src/components/ui';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { VetTabBar } from './src/components/VetTabBar';
import { colors } from './src/theme';

import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import KycScreen from './src/screens/KycScreen';
import KycPendingScreen, { type Kyc } from './src/screens/KycPendingScreen';
import IndependentHomeScreen from './src/screens/IndependentHomeScreen';
import HomeScreen from './src/screens/HomeScreen';
import ClientsScreen from './src/screens/ClientsScreen';
import AlertScreen from './src/screens/AlertScreen';
import ChatsScreen from './src/screens/ChatsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import PatientDetailScreen from './src/screens/PatientDetailScreen';
import NewConsultScreen from './src/screens/NewConsultScreen';
import ReportScreen from './src/screens/ReportScreen';
import ChatThreadScreen from './src/screens/ChatThreadScreen';
import PlanScreen from './src/screens/PlanScreen';
import AttendScreen from './src/screens/AttendScreen';
import MyRecordsScreen from './src/screens/MyRecordsScreen';
import RecordDetailScreen from './src/screens/RecordDetailScreen';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

// React Query en RN no sabe por sí solo cuándo la app pasa a segundo plano ni si
// hay red. Sin esto, los pollers siguen consultando en background y las consultas
// fallan en cadena sin conexión.
try {
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => handleFocus(s === 'active'));
    return () => sub.remove();
  });
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(!!state.isConnected && state.isInternetReachable !== false)),
  );
} catch (e) {
  console.log('[query] managers no disponibles:', e instanceof Error ? e.message : e);
}
const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const AuthNav = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

function AuthStack() {
  return (
    <NavigationContainer>
      <AuthNav.Navigator screenOptions={{ headerShown: false }}>
        <AuthNav.Screen name="Login" component={LoginScreen} />
        <AuthNav.Screen name="Register" component={RegisterScreen} />
      </AuthNav.Navigator>
    </NavigationContainer>
  );
}

function Tabs() {
  return (
    <Tab.Navigator tabBar={(props) => <VetTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Clientes" component={ClientsScreen} />
      <Tab.Screen name="Alerta" component={AlertScreen} />
      <Tab.Screen name="Chats" component={ChatsScreen} />
      <Tab.Screen name="Perfil" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function MainApp({ onBackToIndependent }: { onBackToIndependent?: () => void }) {
  useEffect(() => {
    registerForPush();
    // Navega a la pantalla de Alerta cuando el vet toca una notificación de emergencia.
    // Si la navegación aún no está lista (arranque en frío), reintenta unas veces y desiste
    // (antes el reintento era infinito).
    const goToAlerta = (attempt = 0) => {
      if (navigationRef.isReady()) (navigationRef as never as { navigate: (n: string) => void }).navigate('Alerta');
      else if (attempt < 20) setTimeout(() => goToAlerta(attempt + 1), 300);
    };
    try {
      // Tap con la app abierta / en segundo plano
      const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
        const data = resp.notification.request.content.data as { type?: string };
        if (data?.type === 'emergency') goToAlerta();
      });
      // Tap que abrió la app desde estado cerrado (cold start)
      Notifications.getLastNotificationResponseAsync()
        .then((resp) => {
          const data = resp?.notification.request.content.data as { type?: string } | undefined;
          if (data?.type === 'emergency') goToAlerta();
        })
        .catch(() => {});
      return () => sub.remove();
    } catch (e) {
      console.log('[push] listener no disponible:', e instanceof Error ? e.message : e);
    }
  }, []);

  return (
    <StreamProvider>
      <IndependentBackContext.Provider value={onBackToIndependent ?? null}>
        <NavigationContainer ref={navigationRef}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Tabs" component={Tabs} />
            <Stack.Screen name="PatientDetail" component={PatientDetailScreen} />
            <Stack.Screen name="NewConsult" component={NewConsultScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="Report" component={ReportScreen} />
            <Stack.Screen name="ChatThread" component={ChatThreadScreen} />
            <Stack.Screen name="Plan" component={PlanScreen} />
            <Stack.Screen name="Attend" component={AttendScreen} />
            <Stack.Screen name="MyRecords" component={MyRecordsScreen} />
            <Stack.Screen name="RecordDetail" component={RecordDetailScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </IndependentBackContext.Provider>
    </StreamProvider>
  );
}

/** Vet independiente: aterriza SIEMPRE en el dashboard; su panel propio (perfil,
 *  especialidades, teleconsultas, emergencias) se abre desde Perfil. */
function IndependentRoot({ onJoinedClinic }: { onJoinedClinic: () => void }) {
  const [dashboard, setDashboard] = useState(true);
  if (dashboard) return <MainApp onBackToIndependent={() => setDashboard(false)} />;
  return (
    <IndependentVideoProvider>
      <IndependentHomeScreen onJoinedClinic={onJoinedClinic} onEnterDashboard={() => setDashboard(true)} />
    </IndependentVideoProvider>
  );
}

/** Error de red al decidir la puerta de entrada: antes caía en la pantalla de KYC
 *  como si el vet no estuviera verificado. */
function GateError({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14, backgroundColor: colors.canvas }}>
      <Muted>No pudimos cargar tu perfil. Revisa tu conexión e intenta de nuevo.</Muted>
      <Button title="Reintentar" onPress={onRetry} />
    </View>
  );
}

/** Tras iniciar sesión: decide entre la app completa (clínica), el home independiente,
 *  el KYC o la pantalla de estado. */
function StaffGate() {
  const [forceKyc, setForceKyc] = useState(false);
  const kycQ = useQuery({ queryKey: ['staff-kyc-me'], queryFn: () => api<{ kyc: Kyc | null; hasClinic: boolean }>('/staff-kyc/me') });
  const vetQ = useQuery({ queryKey: ['vet-profile-gate'], queryFn: () => api<{ isIndependent: boolean; hasClinic: boolean }>('/me/vet-profile') });

  if (kycQ.isLoading || vetQ.isLoading) return <Loading />;
  const kyc = kycQ.data?.kyc ?? null;
  const refetch = () => { void kycQ.refetch(); void vetQ.refetch(); };
  if (kycQ.isError || vetQ.isError) return <GateError onRetry={refetch} />;

  if (kycQ.data?.hasClinic) return <MainApp />; // ya es staff de una clínica -> app completa
  if (vetQ.data?.isIndependent) return <IndependentRoot onJoinedClinic={refetch} />; // verificado sin clínica
  if (!kyc || forceKyc) return <KycScreen onSubmitted={() => { setForceKyc(false); refetch(); }} />;
  return <KycPendingScreen kyc={kyc} onRetry={() => setForceKyc(true)} onRefresh={refetch} />;
}

function Root() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <AuthStack />;
  return <StaffGate />;
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts(OUTFIT_FONTS);
  if (fontsLoaded) enableOutfit();
  // Si las fuentes no cargan, seguimos con la fuente del sistema en vez de
  // quedarnos en "cargando" para siempre.
  const ready = fontsLoaded || !!fontError;

  return (
    // Fondo explícito: sin él, la ventana de Android en modo oscuro se veía gris al arrancar.
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="dark" />
            <ErrorBoundary>{ready ? <Root /> : <Loading />}</ErrorBoundary>
            <DialogHost />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
