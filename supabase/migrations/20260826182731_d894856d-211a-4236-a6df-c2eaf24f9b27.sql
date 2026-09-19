REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_like_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_comment_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_follow_counts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;