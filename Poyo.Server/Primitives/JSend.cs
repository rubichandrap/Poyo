using System.Text.Json.Serialization;

namespace Poyo.Server.Primitives;

public static class JSendStatus
{
    public const string Success = "success";
    public const string Fail = "fail";
    public const string Error = "error";
}

public class JSendResponse<T>
{
    [JsonPropertyName("status")]
    public string Status { get; set; } = JSendStatus.Success;

    [JsonPropertyName("data")]
    public T? Data { get; set; }

    [JsonPropertyName("message")]
    public string? Message { get; set; }
}

public static class JSend
{
    public static JSendResponse<T> Success<T>(T data, string? message = null)
    {
        return new JSendResponse<T>
        {
            Status = JSendStatus.Success,
            Data = data,
            Message = message
        };
    }

    public static JSendResponse<object> Success(string? message = null)
    {
        return new JSendResponse<object>
        {
            Status = JSendStatus.Success,
            Data = null,
            Message = message
        };
    }

    public static JSendResponse<T> Fail<T>(T data, string? message = null)
    {
        return new JSendResponse<T>
        {
            Status = JSendStatus.Fail,
            Data = data,
            Message = message
        };
    }

    public static JSendResponse<object> Error(string message)
    {
        return new JSendResponse<object>
        {
            Status = JSendStatus.Error,
            Message = message,
            Data = null
        };
    }

    public static JSendResponse<T> Error<T>(string message, T? data = default)
    {
        return new JSendResponse<T>
        {
            Status = JSendStatus.Error,
            Message = message,
            Data = data
        };
    }
}

