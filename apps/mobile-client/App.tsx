import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';

import { AuthProvider, useAuth } from './src/lib/auth';
import { api } from './src/lib/api';
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
import ChatsScreen from './src/screens/ChatsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import RegisterPetScreen from './src/screens/RegisterPetScreen';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function Tabs() {
  return (
    <Tab.Navigator tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Directorio" component={DirectoryScreen} />
      <Tab.Screen name="Chats" component={ChatsScreen} />
      <Tab.Screen name="Expediente" component={PetsScreen} />
    </Tab.Navigator>
  );
}

function MainApp() {
  return (
    <NavigationContainer>
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
        <Stack.Screen name="PetDetail" component={PetDetailScreen} options={({ route }: any) => ({ title: route.params?.name ?? 'Ficha' })} />
        <Stack.Screen name="RegisterPet" component={RegisterPetScreen} options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="Perfil" component={ProfileScreen} options={{ title: 'Mi Perfil' }} />
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
  return <MainApp />;
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
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="dark" />
          <Root />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
