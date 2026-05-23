# OneDrive integration

`onedrive.rb` is a small Microsoft Graph client for OneDrive that uses
only the Ruby standard library.

## Getting an access token

1. Register an application in the Azure portal (Azure Active Directory →
   App registrations → New registration). Use the "Mobile and desktop
   applications" platform with redirect URI
   `http://localhost`.
2. Under **API permissions**, add delegated Microsoft Graph permissions:
   `Files.ReadWrite` (and optionally `offline_access`).
3. Sign the user in and exchange the auth code for an access token via the
   OAuth 2.0 authorization-code flow. The token's `access_token` field is
   what `onedrive.rb` expects.
4. Export it before running the script:

   ```sh
   export MS_GRAPH_ACCESS_TOKEN="eyJ0eXAiOi..."
   ```

Tokens are short-lived (~1 hour). Refresh them with the refresh token if
you requested `offline_access`.

## CLI usage

```sh
ruby onedrive.rb list                 # list drive root
ruby onedrive.rb list /Documents      # list a folder
ruby onedrive.rb download /a.txt ./a.txt
ruby onedrive.rb upload ./a.txt /a.txt
ruby onedrive.rb delete /a.txt
```

## Library usage

```ruby
require_relative "onedrive"

drive = OneDrive.new # reads MS_GRAPH_ACCESS_TOKEN
drive.list(path: "/Documents").each { |f| puts f["name"] }
```

## Limitations

- Uploads use the simple PUT endpoint and are capped at 4 MB. Larger
  files require an upload session, which is not implemented yet.
- The client assumes the caller already holds a valid access token; it
  does not perform the OAuth flow itself.
