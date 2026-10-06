import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { mySubscriptionsQuery, myLikesQuery, toggleSubscription, toggleLike } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

export function useLikes() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: liked } = useQuery(myLikesQuery(user?.id));

  const mutation = useMutation({
    mutationFn: async (postId: string) => {
      if (!user) throw new Error("auth");
      await toggleLike(postId, user.id, Boolean(liked?.includes(postId)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-likes"] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["post"] });
    },
    onError: (error) => {
      toast.error(error.message === "auth" ? "Sign in to like posts" : "Couldn't update your like");
    },
  });

  return {
    likedIds: liked ?? [],
    isLiked: (postId: string) => Boolean(liked?.includes(postId)),
    toggle: mutation.mutate,
    toggleAsync: mutation.mutateAsync,
    pending: mutation.isPending,
    canLike: Boolean(user),
  };
}

export function useSubscriptions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: subscriptions } = useQuery(mySubscriptionsQuery(user?.id));

  const mutation = useMutation({
    mutationFn: async (targetId: string) => {
      if (!user) throw new Error("auth");
      const subscribed = Boolean(subscriptions?.includes(targetId));
      await toggleSubscription(targetId, user.id, subscribed);
      return subscribed;
    },
    onSuccess: (wasSubscribed) => {
      queryClient.invalidateQueries({ queryKey: ["my-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success(wasSubscribed ? "Unsubscribed" : "Subscribed");
    },
    onError: (error) => {
      toast.error(error.message === "auth" ? "Sign in to subscribe" : "Couldn't update subscription");
    },
  });

  return {
    isSubscribed: (id: string) => Boolean(subscriptions?.includes(id)),
    toggle: mutation.mutate,
    pending: mutation.isPending,
    canSubscribe: Boolean(user),
  };
}
