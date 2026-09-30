using System.Text.Json;

namespace Poyo.Framework;

/// <summary>
/// The registry's shape, checked on the raw JSON before the deserializer sees
/// it: the one spelling of every field name a route may use, the members it
/// must carry, and the two declared values whose type is part of the contract
/// rather than a detail of the model.
///
/// These are the checks the deserializer either cannot make or cannot report
/// usefully. It refuses a member it cannot map, but its message names the
/// member and its position in the JSON rather than the route that declared it;
/// its enum converter names the field and not the route; and a route that
/// omits `files` altogether deserializes to a null that only surfaces when the
/// routes are mapped. Each is reported here instead, where the offending route
/// can be named.
/// </summary>
internal static class RouteSchema
{
    /// <summary>
    /// The field names a route may declare, in one spelling each. The
    /// deserializer would map a mis-cased member to the member it resembles —
    /// its property matching is how the .NET model is spelled — so this is what
    /// makes a field have one accepted spelling rather than two: one spelling
    /// per field across all three runtimes that read the registry, so a rule
    /// written once means one thing.
    /// </summary>
    private static readonly string[] RouteFields =
    [
        "path",
        "name",
        "files",
        "access",
        "seo",
        "controller",
        "action",
        "dynamic",
    ];

    private static readonly string[] FileFields = ["react", "view"];

    private static readonly string[] AccessValues = ["public", "guest", "protected"];

    /// <summary>
    /// The route under test and the registry it was read from — the two facts
    /// every message here is worded from, carried together so a pass is a
    /// question about one route in one file rather than a pair of arguments
    /// every method has to keep in step.
    /// </summary>
    private readonly record struct SchemaContext(JsonElement Route, string RegistryPath);

    /// <summary>
    /// Fails the boot unless every route declares a shape the registry
    /// contract names. The order of the three passes is the order of how much
    /// each says: a value that is wrong is reported before a name that is
    /// wrong, because a mis-spelled name is a symptom and a bad value is the
    /// mistake; and both are reported before an absence, which the
    /// deserializer would turn into a null reference at request time.
    /// </summary>
    public static void Validate(JsonElement root, string routesJsonPath)
    {
        if (root.ValueKind != JsonValueKind.Array)
        {
            return;
        }

        foreach (var element in root.EnumerateArray())
        {
            if (element.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var context = new SchemaContext(element, routesJsonPath);

            ValidateDeclaredValues(context);
            ValidateFieldNames(context);
            ValidateRequiredMembers(context);
        }
    }

    /// <summary>
    /// The two fields whose value is part of what the registry means, so a
    /// wrong one is a mistake about the route rather than a malformed file.
    /// The two are told apart in the message they earn: a `dynamic` that is both
    /// mis-spelled and wrongly valued is diagnosed for the value — the thing
    /// that is actually wrong — with the spelling beside it, because a
    /// mis-spelled name is only a symptom of the one mistake to fix.
    /// </summary>
    private static void ValidateDeclaredValues(SchemaContext context)
    {
        ValidateValue(
            context,
            "access",
            declared => declared.ValueKind == JsonValueKind.String
                && AccessValues.Contains(declared.GetString()),
            (_, declared) => $"declares {Quote(declared.Name)}={AsWritten(declared.Value)} — expected one of "
                + $"{string.Join(", ", AccessValues)}.");

        ValidateValue(
            context,
            "dynamic",
            declared => declared.ValueKind is JsonValueKind.True or JsonValueKind.False,
            (field, declared) => $"has an invalid {field} field {Quote(declared.Name)}: expected boolean, "
                + $"got {declared.Value.ValueKind}.");
    }

    /// <summary>
    /// Fails the boot unless a declared field's value is one the contract names.
    /// Anything that is not one of the values is refused, including the numbers
    /// and nulls the deserializer would reject, so the message names the route
    /// instead of a position in the JSON. Each field is looked up without regard
    /// to case, so a value check can still diagnose a field whose name is the
    /// mistake, and the complaint quotes the spelling the registry was written
    /// in, because the operator has to edit the text they wrote.
    /// </summary>
    private static void ValidateValue(
        SchemaContext context,
        string field,
        Func<JsonElement, bool> isDeclaredValue,
        Func<string, JsonProperty, string> complaint)
    {
        if (!TryGetPropertyIgnoringCase(context.Route, field, out var declared)
            || isDeclaredValue(declared.Value))
        {
            return;
        }

        throw Fail(context, complaint(field, declared));
    }

    /// <summary>
    /// Fails the boot unless every field name a route and its files object
    /// declare is spelled exactly one way. The deserializer accepts a second
    /// spelling of each — that is what makes a lower camel case registry map
    /// onto a PascalCase model at all — so this is the pass that decides one
    /// spelling is the only one, and it names the route beside the mistake
    /// instead of leaving a JSON path in its place.
    /// </summary>
    private static void ValidateFieldNames(SchemaContext context)
    {
        foreach (var member in context.Route.EnumerateObject())
        {
            if (!RouteFields.Contains(member.Name))
            {
                throw Fail(
                    context,
                    $"declares unknown field {Quote(member.Name)} (not a supported route field).");
            }
        }

        if (!context.Route.TryGetProperty("files", out var files) || files.ValueKind != JsonValueKind.Object)
        {
            return;
        }

        foreach (var member in files.EnumerateObject())
        {
            if (!FileFields.Contains(member.Name))
            {
                throw Fail(
                    context,
                    $"declares unknown field {Quote($"files.{member.Name}")} (not a supported route field).");
            }
        }
    }

    /// <summary>
    /// Fails the boot unless a route declares the members without which nothing
    /// can serve it. Only presence and type are checked: a blank file path is
    /// not part of a route's identity, and the registry is authored, so judging
    /// one is left to the route manager that resolves it.
    /// </summary>
    private static void ValidateRequiredMembers(SchemaContext context)
    {
        if (!context.Route.TryGetProperty("files", out var files) || files.ValueKind != JsonValueKind.Object)
        {
            throw Fail(
                context,
                "declares no \"files\". A route names the React page and the view that serve it.");
        }

        if (!files.TryGetProperty("view", out var view) || view.ValueKind != JsonValueKind.String)
        {
            throw Fail(
                context,
                "declares no \"files.view\". The view is the one member the server reads, so a route "
                    + "without it cannot be served.");
        }
    }

    /// <summary>
    /// The one place a route's failure is worded: the registry, the route, and
    /// what is wrong with it. A violation of the shape and a violation of the
    /// identity are read as one contract because they are worded the same way.
    /// </summary>
    private static RoutePolicyException Fail(SchemaContext context, string detail) =>
        new(
            $"{RouteIdentity.RegistryLabel(context.RegistryPath)}: "
                + $"{Describe(context.Route)} {detail}");

    /// <summary>
    /// Finds a declared field whatever case it was written in. The exact
    /// spelling is reported by the caller, not the one the schema knows,
    /// because the operator has to edit the file they wrote.
    /// </summary>
    private static bool TryGetPropertyIgnoringCase(
        JsonElement route,
        string field,
        out JsonProperty declared)
    {
        foreach (var member in route.EnumerateObject())
        {
            if (string.Equals(member.Name, field, StringComparison.OrdinalIgnoreCase))
            {
                declared = member;
                return true;
            }
        }

        declared = default;
        return false;
    }

    /// <summary>A declared value as it was written, quoted when it is text.</summary>
    private static string AsWritten(JsonElement value) =>
        value.ValueKind == JsonValueKind.String ? $"\"{value.GetString()}\"" : value.ToString();

    private static string Quote(string value) => $"'{value}'";

    /// <summary>
    /// Identifies a route by whichever half of its identity is still readable,
    /// which is the same rule <see cref="RouteIdentity"/> uses when it reports
    /// a violation.
    /// </summary>
    private static string Describe(JsonElement route)
    {
        var path = route.TryGetProperty("path", out var declared)
            && declared.ValueKind == JsonValueKind.String
                ? declared.GetString()
                : null;
        var name = route.TryGetProperty("name", out var named)
            && named.ValueKind == JsonValueKind.String
                ? named.GetString()
                : null;

        return RouteIdentity.Describe(path, name);
    }
}
