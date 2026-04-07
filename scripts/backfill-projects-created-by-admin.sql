-- Legacy projects had NULL created_by_id. Attribute them to the primary Admin account:
-- the earliest-created active user with role = admin (typically the seeded Admin).
UPDATE projects AS p
SET created_by_id = sub.id
FROM (
  SELECT u.id
  FROM users u
  WHERE u.role = 'admin'
    AND u.is_active = true
  ORDER BY u.created_at ASC NULLS LAST
  LIMIT 1
) AS sub
WHERE p.created_by_id IS NULL;
