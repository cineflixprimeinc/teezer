import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "./types";
import { SignupScreen } from "@/screens/auth/SignupScreen";
import { LoginScreen } from "@/screens/auth/LoginScreen";
import { LoginFormScreen } from "@/screens/auth/LoginFormScreen";
import { EmailSignupScreen } from "@/screens/auth/EmailSignupScreen";

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  return (
    <Stack.Navigator initialRouteName="Signup" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="LoginForm" component={LoginFormScreen} />
      <Stack.Screen name="EmailSignup" component={EmailSignupScreen} />
    </Stack.Navigator>
  );
}
