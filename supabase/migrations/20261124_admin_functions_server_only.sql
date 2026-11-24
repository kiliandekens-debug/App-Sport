-- L'administration a quitté l'app (page /admin retirée) pour le back-office séparé
-- (admin.kadeon.be), qui passe par la fonction edge « admin » côté serveur.
-- Les anciennes fonctions RPC ne sont donc plus appelables depuis l'app, par personne.
revoke execute on function public.admin_users() from public, anon, authenticated;
revoke execute on function public.admin_set_role(uuid, text) from public, anon, authenticated;
