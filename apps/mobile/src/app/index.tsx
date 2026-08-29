import { Redirect } from 'expo-router';

import { LoadingState } from '@/components/ui';
import { useAuthKitchen } from '@/providers/auth-kitchen';

export default function Index() {
  const { bootstrapping, user, kitchenId } = useAuthKitchen();
  if (bootstrapping) {
    return <LoadingState />;
  }
  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }
  if (!kitchenId) {
    return <Redirect href="/(app)/kitchens" />;
  }
  return <Redirect href="/(app)/(tabs)/stock" />;
}
