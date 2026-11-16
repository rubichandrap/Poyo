using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc.Testing;
using Poyo.Server.Tests.Support;

namespace Poyo.Server.Tests;

/// <summary>
/// The head-parity corpus (fixtures/head/head-parity.json), read by the
/// server's side of it. For each case the served document's head must be the
/// expected one, and the descriptor must carry the registry seo the client
/// runtime's suite applies — so a document load and a dynamic navigation show
/// the same head, held to one file rather than two sets of assertions.
/// </summary>
public class HeadParityCorpusTests : IClassFixture<HeadParityServerFixture>
{
    private readonly HeadParityServerFixture _fixture;

    public HeadParityCorpusTests(HeadParityServerFixture fixture)
    {
        _fixture = fixture;
    }

    public static TheoryData<string> Cases()
    {
        var data = new TheoryData<string>();
        foreach (var corpusCase in HeadParityCorpus.Cases)
        {
            data.Add(corpusCase["id"]!.GetValue<string>());
        }

        return data;
    }

    [Theory]
    [MemberData(nameof(Cases))]
    public async Task The_document_head_is_the_expected_head(string id)
    {
        var corpusCase = HeadParityCorpus.Require(id);
        var html = await _fixture.Client.GetStringAsync("/" + corpusCase["name"]!.GetValue<string>());

        var actual = HeadReader.Read(html);

        Assert.Equal(HeadParityCorpus.TitleTemplate, actual.TitleTemplate);
        Assert.True(
            JsonNode.DeepEquals(corpusCase["expected"], actual.ToJson()),
            $"document head for '{id}':\n{actual.ToJson()}\nexpected:\n{corpusCase["expected"]}");
    }

    [Theory]
    [MemberData(nameof(Cases))]
    public async Task The_descriptor_carries_the_registry_seo(string id)
    {
        var corpusCase = HeadParityCorpus.Require(id);
        var response = await _fixture.Client.SendAsync(
            NavigationRequests.Descriptor("/" + corpusCase["name"]!.GetValue<string>()));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var descriptor = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;

        Assert.True(
            JsonNode.DeepEquals(HeadParityCorpus.DescriptorSeo(corpusCase), descriptor["seo"]),
            $"descriptor seo for '{id}': {descriptor["seo"]?.ToJsonString() ?? "null"}");
    }
}

public sealed class HeadParityServerFixture : IDisposable
{
    private readonly TemporaryDirectory _directory;

    public HeadParityServerFixture()
    {
        _directory = TemporaryDirectory.Create("head-parity");
        var registryPath = Path.Combine(_directory.Path, "routes.json");
        // Written the way a person writes routes.json: characters such as "<"
        // stay literal, so the layout is tested against what an author can put
        // there rather than against the serializer's own escaping.
        File.WriteAllText(
            registryPath,
            HeadParityCorpus.Registry().ToJsonString(new JsonSerializerOptions
            {
                Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
            }));

        Factory = TestEnvironment.CreateServer(registryPath, startClient: true);
        Client = Factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false,
        });
    }

    public WebApplicationFactory<Program> Factory { get; }

    public HttpClient Client { get; }

    public void Dispose()
    {
        Client.Dispose();
        Factory.Dispose();
        _directory.Dispose();
    }
}

internal static class HeadParityCorpus
{
    private static readonly JsonNode Corpus = JsonNode.Parse(
        File.ReadAllText(Path.Combine(SourceDirectory.Nearest("fixtures/head"), "head-parity.json")))!;

    public static string TitleTemplate => Corpus["titleTemplate"]!.GetValue<string>();

    public static IEnumerable<JsonNode> Cases => Corpus["cases"]!.AsArray().Select(c => c!);

    public static JsonNode Require(string id) =>
        Cases.Single(c => c["id"]!.GetValue<string>() == id);

    /// <summary>One public route per case, served by a plain registry view.</summary>
    public static JsonArray Registry()
    {
        var routes = new JsonArray();
        foreach (var corpusCase in Cases)
        {
            var name = corpusCase["name"]!.GetValue<string>();
            var route = new JsonObject
            {
                ["path"] = "/" + name,
                ["name"] = name,
                ["files"] = new JsonObject
                {
                    ["react"] = $"src/pages/{name}/index.page.tsx",
                    ["view"] = "Views/Home/Index.cshtml",
                },
                ["access"] = "public",
            };
            if (corpusCase["seo"] is JsonNode seo)
            {
                route["seo"] = seo.DeepClone();
            }

            routes.Add(route);
        }

        return routes;
    }

    /// <summary>The registry seo as the descriptor carries it.</summary>
    public static JsonNode? DescriptorSeo(JsonNode corpusCase)
    {
        if (corpusCase["seo"] is not JsonObject seo)
        {
            return null;
        }

        return new JsonObject
        {
            ["title"] = seo["title"]?.DeepClone(),
            ["description"] = seo["description"]?.DeepClone(),
            ["meta"] = seo["meta"]?.DeepClone(),
            ["jsonLd"] = seo["jsonld"]?.DeepClone(),
        };
    }
}

/// <summary>
/// Reads the route-owned part of a served head: the title (and its template)
/// and every element marked data-poyo-seo. Enough of an HTML reader for the
/// layout this suite renders; not a general parser.
/// </summary>
internal sealed record HeadReader(
    string Title,
    string? TitleTemplate,
    string? Description,
    Dictionary<string, string> Meta,
    JsonNode? JsonLd)
{
    private static readonly Regex TitlePattern = new(
        "<title(?<attrs>[^>]*)>(?<text>.*?)</title>", RegexOptions.Singleline);
    private static readonly Regex TagPattern = new("<meta\\s(?<attrs>[^>]*)>", RegexOptions.Singleline);
    private static readonly Regex ScriptPattern = new(
        "<script(?<attrs>[^>]*)>(?<body>.*?)</script>", RegexOptions.Singleline);
    private static readonly Regex AttributePattern = new(
        "(?<name>[\\w:-]+)(?:=\"(?<value>[^\"]*)\")?");

    public static HeadReader Read(string html)
    {
        var head = html[..html.IndexOf("</head>", StringComparison.Ordinal)];

        var title = TitlePattern.Match(head);
        var titleAttributes = Attributes(title.Groups["attrs"].Value);

        string? description = null;
        var meta = new Dictionary<string, string>();
        foreach (Match tag in TagPattern.Matches(head))
        {
            var attributes = Attributes(tag.Groups["attrs"].Value);
            if (!attributes.ContainsKey("data-poyo-seo"))
            {
                continue;
            }

            var key = attributes.GetValueOrDefault("property") ?? attributes["name"];
            var content = attributes.GetValueOrDefault("content") ?? string.Empty;
            if (key == "description")
            {
                description = content;
            }
            else
            {
                meta[key] = content;
            }
        }

        JsonNode? jsonLd = null;
        foreach (Match script in ScriptPattern.Matches(head))
        {
            if (Attributes(script.Groups["attrs"].Value).ContainsKey("data-poyo-seo"))
            {
                jsonLd = JsonNode.Parse(script.Groups["body"].Value);
            }
        }

        return new HeadReader(
            WebUtility.HtmlDecode(title.Groups["text"].Value.Trim()),
            titleAttributes.GetValueOrDefault("data-poyo-title-template"),
            description,
            meta,
            jsonLd);
    }

    private static Dictionary<string, string> Attributes(string text)
    {
        var attributes = new Dictionary<string, string>();
        foreach (Match attribute in AttributePattern.Matches(text))
        {
            attributes[attribute.Groups["name"].Value] =
                WebUtility.HtmlDecode(attribute.Groups["value"].Value);
        }

        return attributes;
    }

    public JsonNode ToJson()
    {
        var meta = new JsonObject();
        foreach (var (key, value) in Meta)
        {
            meta[key] = value;
        }

        return new JsonObject
        {
            ["title"] = Title,
            ["description"] = Description,
            ["meta"] = meta,
            ["jsonLd"] = JsonLd?.DeepClone(),
        };
    }
}
