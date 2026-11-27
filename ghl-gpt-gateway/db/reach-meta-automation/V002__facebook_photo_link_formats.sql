-- Expand only validated action formats. No existing rows or credentials are changed.
BEGIN;
ALTER TABLE public.agency_social_meta_actions
 DROP CONSTRAINT agency_social_meta_actions_kind_check,
 DROP CONSTRAINT agency_social_meta_actions_check,
 ADD CONSTRAINT agency_social_meta_actions_kind_check CHECK(kind IN ('facebook_post','facebook_photo','facebook_link','instagram_photo','facebook_comment_reply','instagram_comment_reply','facebook_message_reply','instagram_message_reply')),
 ADD CONSTRAINT agency_social_meta_actions_media_check CHECK(
 (kind IN ('instagram_photo','facebook_photo','facebook_link') AND media_url IS NOT NULL) OR
 (kind NOT IN ('instagram_photo','facebook_photo','facebook_link') AND media_url IS NULL)
 );
COMMIT;
