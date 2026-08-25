import 'react-native-gesture-handler';
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';

import { OUTFIT_FONTS, enableOutfit } from './src/lib/fonts';
import { registerForPush } from './src/lib/push';
import { AuthProvider, useAuth } from './src/lib/auth';
import { StreamProvider } from './src/lib/stream';
import { IndependentBackContext } from './src/lib/independentMode';
import { api } from './src/lib/api';
import { DialogHost } from './src/lib/dialog';
import { Loading } from './src/components/ui';
import { VetTabBar } from './src/components/VetTabBar';

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

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
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
    const goToAlerta = () => {
      const nav = () => {
        if (navigationRef.isReady()) (navigationRef as never as { navigate: (n: string) => void }).navigate('Alerta');
        else setTimeout(nav, 300);
      };
      nav();
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
          </Stack.Navigator>
        </NavigationContainer>
      </IndependentBackContext.Provider>
    </StreamProvider>
  );
}

/** Vet independiente: alterna entre su panel propio y el dashboard principal. */
function IndependentRoot({ onJoinedClinic }: { onJoinedClinic: () => void }) {
  const [dashboard, setDashboard] = useState(false);
  if (dashboard) return <MainApp onBackToIndependent={() => setDashboard(false)} />;
  return <IndependentHomeScreen onJoinedClinic={onJoinedClinic} onEnterDashboard={() => setDashboard(true)} />;
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
  const [fontsLoaded] = useFonts(OUTFIT_FONTS);
  if (fontsLoaded) enableOutfit();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="dark" />
            {fontsLoaded ? <Root /> : <Loading />}
            <DialogHost />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
