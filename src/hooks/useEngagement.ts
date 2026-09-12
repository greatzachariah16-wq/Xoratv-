import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { myFollowsQuery, myLikesQuery, toggleFollow, toggleLike } from "@/lib/api";
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
    pending: mutation.isPending,
    canLike: Boolean(user),
  };
}

export function useFollows() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: following } = useQuery(myFollowsQuery(user?.id));

  const mutation = useMutation({
    mutationFn: async (targetId: string) => {
      if (!user) throw new Error("auth");
      await toggleFollow(targetId, user.id, Boolean(following?.includes(targetId)));
      return Boolean(following?.includes(targetId));
    },
    onSuccess: (wasFollowing) => {
      queryClient.invalidateQueries({ queryKey: ["my-follows"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success(wasFollowing ? "Unfollowed" : "Following");
    },
    onError: (error) => {
      toast.error(
        error.message === "auth" ? "Sign in to follow creators" : "Couldn't update follow",
      );
    },
  });

  return {
    isFollowing: (id: string) => Boolean(following?.includes(id)),
    toggle: mutation.mutate,
    pending: mutation.isPending,
    canFollow: Boolean(user),
  };
}
