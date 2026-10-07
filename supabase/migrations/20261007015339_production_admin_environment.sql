-- Rename the existing live deployment scope; retain roles and revocations.
-- This does not provision another environment or grant new administrative powers.
update admin_private.memberships
set environments = array(select distinct scope from unnest(array_replace(environments, 'gcp-test', 'production')) as scope),
    reason = 'Existing live GCP deployment promoted to the sole Production admin environment at owner request'
where 'gcp-test' = any(environments);
