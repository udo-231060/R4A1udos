package jp.ac.campus;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

@RestControllerAdvice
public class ApiErrors {
    static class Problem extends RuntimeException {
        final int status;
        Problem(int status, String message) { super(message); this.status = status; }
    }
    @ExceptionHandler(Problem.class)
    ResponseEntity<?> problem(Problem e) { return ResponseEntity.status(e.status).body(Map.of("error", e.getMessage())); }
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<?> validation(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
            .sorted(java.util.Comparator.comparing(error -> error.getField().equals("username") ? 0 : 1))
            .map(error -> error.getDefaultMessage()).distinct().collect(java.util.stream.Collectors.joining(" "));
        return ResponseEntity.badRequest().body(Map.of("error", message));
    }
    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<?> invalid(Exception e) { return ResponseEntity.badRequest().body(Map.of("error", "入力内容を確認してください。")); }
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<?> oversized(Exception e) { return ResponseEntity.status(413).body(Map.of("error", "画像は8MB、動画は20MB以内です。")); }
}
