#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"
require "net/http"
require "uri"

# Minimal Microsoft Graph client for OneDrive (personal / business).
# Authentication is delegated: pass an access token via the
# `MS_GRAPH_ACCESS_TOKEN` environment variable. See README_ONEDRIVE.md
# for how to obtain one.
class OneDrive
  GRAPH_BASE = "https://graph.microsoft.com/v1.0"

  class Error < StandardError; end

  def initialize(access_token: ENV.fetch("MS_GRAPH_ACCESS_TOKEN"))
    @access_token = access_token
  end

  # List children of a OneDrive folder. `path` is a OneDrive path like
  # "/Documents" or "" for the drive root.
  def list(path: "")
    endpoint =
      if path.empty?
        "/me/drive/root/children"
      else
        "/me/drive/root:#{encode_path(path)}:/children"
      end
    request(:get, endpoint).fetch("value")
  end

  # Download a file's bytes by OneDrive path.
  def download(path)
    raise ArgumentError, "path required" if path.nil? || path.empty?

    uri = URI("#{GRAPH_BASE}/me/drive/root:#{encode_path(path)}:/content")
    response = http_request(Net::HTTP::Get.new(uri))
    case response
    when Net::HTTPRedirection
      Net::HTTP.get(URI(response["location"]))
    when Net::HTTPSuccess
      response.body
    else
      raise Error, "download failed: #{response.code} #{response.body}"
    end
  end

  # Upload local file bytes to OneDrive at the given destination path.
  # Uses the simple PUT upload (<= 4 MB). For larger files an upload
  # session would be required.
  def upload(local_path, dest_path)
    bytes = File.binread(local_path)
    if bytes.bytesize > 4 * 1024 * 1024
      raise Error, "files > 4MB require an upload session (not implemented)"
    end

    uri = URI("#{GRAPH_BASE}/me/drive/root:#{encode_path(dest_path)}:/content")
    req = Net::HTTP::Put.new(uri)
    req["Content-Type"] = "application/octet-stream"
    req.body = bytes
    parse_json(http_request(req))
  end

  # Delete a file or folder by path.
  def delete(path)
    request(:delete, "/me/drive/root:#{encode_path(path)}")
  end

  private

  def request(method, endpoint)
    uri = URI("#{GRAPH_BASE}#{endpoint}")
    klass = {
      get: Net::HTTP::Get,
      delete: Net::HTTP::Delete,
    }.fetch(method)
    parse_json(http_request(klass.new(uri)))
  end

  def http_request(req)
    req["Authorization"] = "Bearer #{@access_token}"
    req["Accept"] = "application/json"
    uri = req.uri
    Net::HTTP.start(uri.host, uri.port, use_ssl: true) do |http|
      http.request(req)
    end
  end

  def parse_json(response)
    return nil if response.is_a?(Net::HTTPNoContent)

    unless response.is_a?(Net::HTTPSuccess)
      raise Error, "graph request failed: #{response.code} #{response.body}"
    end

    body = response.body.to_s
    body.empty? ? nil : JSON.parse(body)
  end

  # OneDrive path segments must be URL-encoded but slashes preserved.
  def encode_path(path)
    normalized = path.start_with?("/") ? path : "/#{path}"
    normalized.split("/").map { |s| URI.encode_www_form_component(s) }.join("/")
  end
end

if $PROGRAM_NAME == __FILE__
  command, *args = ARGV
  client = OneDrive.new

  case command
  when "list"
    files = client.list(path: args[0].to_s)
    files.each do |f|
      kind = f["folder"] ? "DIR " : "FILE"
      size = f["size"] || 0
      puts "#{kind}\t#{size}\t#{f['name']}"
    end
  when "download"
    src, dest = args
    abort "usage: onedrive.rb download <remote-path> <local-path>" if src.nil? || dest.nil?
    File.binwrite(dest, client.download(src))
    puts "downloaded #{src} -> #{dest}"
  when "upload"
    local, remote = args
    abort "usage: onedrive.rb upload <local-path> <remote-path>" if local.nil? || remote.nil?
    result = client.upload(local, remote)
    puts "uploaded -> #{result['webUrl']}"
  when "delete"
    target = args[0]
    abort "usage: onedrive.rb delete <remote-path>" if target.nil?
    client.delete(target)
    puts "deleted #{target}"
  else
    warn "usage: onedrive.rb {list [path] | download <src> <dest> | upload <src> <dest> | delete <path>}"
    exit 1
  end
end
