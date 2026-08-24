import 'react-native-gesture-handler';
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useFonts } from 'expo-font';

import { OUTFIT_FONTS, enableOutfit } from './src/lib/fonts';
import { registerForPush } from './src/lib/push';
import { AuthProvider, useAuth } from './src/lib/auth';
import { StreamProvider } from './src/lib/stream';
import { api } from './src/lib/api';
import { DialogHost } from './src/lib/dialog';
import { EditFieldHost } from './src/lib/editField';
import { Loading } from './src/components/ui';
import { TabBar } from './src/components/TabBar';
import { colors } from './src/theme';

import OnboardingScreen from './src/screens/OnboardingScreen';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import PanicScreen from './src/screens/PanicScreen';
import TrackingScreen from './src/screens/TrackingScreen';
import PetsScreen from './src/screens/PetsScreen';
import PetDetailScreen from './src/screens/PetDetailScreen';
import DirectoryScreen from './src/screens/DirectoryScreen';
import ClinicDetailScreen from './src/screens/ClinicDetailScreen';
import BookAppointmentScreen from './src/screens/BookAppointmentScreen';
import ConfirmPayScreen from './src/screens/ConfirmPayScreen';
import AiChatScreen from './src/screens/AiChatScreen';
import ClinicChatScreen from './src/screens/ClinicChatScreen';
import RatingScreen from './src/screens/RatingScreen';
import CareCalendarScreen from './src/screens/CareCalendarScreen';
import ChatsScreen from './src/screens/ChatsScreen';
import EmergencyClinicsScreen from './src/screens/EmergencyClinicsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import PetProfileScreen from './src/screens/PetProfileScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import RegisterPetScreen from './src/screens/RegisterPetScreen';
import ReceiptsScreen from './src/screens/ReceiptsScreen';
import RecordDetailScreen from './src/screens/RecordDetailScreen';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

function Tabs() {
  return (
    <Tab.Navigator tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Directorio" component={DirectoryScreen} />
      <Tab.Screen name="Alerta" component={EmergencyClinicsScreen} />
      <Tab.Screen name="Chats" component={ChatsScreen} />
      <Tab.Screen name="Citas" component={CareCalendarScreen} />
    </Tab.Navigator>
  );
}

function MainApp() {
  useEffect(() => {
    registerForPush();
    try {
      const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
        const data = resp.notification.request.content.data as { type?: string };
        if (data?.type === 'appointment' && navigationRef.isReady()) {
          (navigationRef as never as { navigate: (n: string, p: object) => void }).navigate('Tabs', { screen: 'Citas' });
        }
      });
      return () => sub.remove();
    } catch (e) {
      console.log('[push] listener no disponible:', e instanceof Error ? e.message : e);
    }
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.canvas },
          headerTintColor: colors.brand,
          headerTitleStyle: { color: colors.text },
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="Panic" component={PanicScreen} options={{ title: 'Emergencia', presentation: 'modal' }} />
        <Stack.Screen name="Tracking" component={TrackingScreen} options={{ title: 'Seguimiento', headerBackVisible: false }} />
        <Stack.Screen name="Expediente" component={PetsScreen} options={{ title: 'Expediente' }} />
        <Stack.Screen name="PetDetail" component={PetDetailScreen} options={({ route }: any) => ({ title: route.params?.name ?? 'Ficha' })} />
        <Stack.Screen name="RegisterPet" component={RegisterPetScreen} options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="Configuracion" component={SettingsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Receipts" component={ReceiptsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="RecordDetail" component={RecordDetailScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Perfil" component={ProfileScreen} options={{ headerShown: false }} />
        <Stack.Screen name="PetProfile" component={PetProfileScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ClinicDetail" component={ClinicDetailScreen} options={{ headerShown: false }} />
        <Stack.Screen name="BookAppointment" component={BookAppointmentScreen} options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="ConfirmPay" component={ConfirmPayScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AiChat" component={AiChatScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ClinicChat" component={ClinicChatScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Rating" component={RatingScreen} options={{ headerShown: false, presentation: 'modal' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

/** Tras iniciar sesión: si es el primer uso y no hay mascotas, ofrece registrar una. */
function MainGate() {
  const [prompted, setPrompted] = useState<boolean | null>(null);
  const pets = useQuery({ queryKey: ['pets'], queryFn: () => api<{ data: unknown[] }>('/me/pets') });

  useEffect(() => {
    AsyncStorage.getItem('migo_pet_prompted').then((v) => setPrompted(v === '1'));
  }, []);

  if (prompted === null || pets.isLoading) return <Loading />;

  const finish = () => {
    AsyncStorage.setItem('migo_pet_prompted', '1');
    setPrompted(true);
    pets.refetch();
  };

  if (!prompted && (pets.data?.data.length ?? 0) === 0) {
    return <RegisterPetScreen onComplete={finish} onSkip={finish} />;
  }
  return (
    <StreamProvider>
      <MainApp />
    </StreamProvider>
  );
}

function Root() {
  const { user, loading } = useAuth();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('migo_onboarded').then((v) => setOnboarded(v === '1'));
  }, []);

  if (loading || onboarded === null) return <Loading />;

  const finishOnboarding = () => {
    AsyncStorage.setItem('migo_onboarded', '1');
    setOnboarded(true);
  };

  if (!user) {
    return !onboarded ? <OnboardingScreen onDone={finishOnboarding} /> : <LoginScreen />;
  }
  return <MainGate />;
}

export default function App() {
  const [fontsLoaded] = useFonts(OUTFIT_FONTS);
  // Activa Outfit global una vez cargadas las fuentes, antes de renderizar la app.
  if (fontsLoaded) enableOutfit();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="dark" />
            {fontsLoaded ? <Root /> : <Loading />}
            <DialogHost />
            <EditFieldHost />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
